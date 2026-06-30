// =====================================================================
// Aurora TPV — Servicio de impresión térmica (proceso principal Electron).
//
// Envía bytes ESC/POS por distintos transportes SIN dependencias nativas:
//   - network        : socket TCP a IP:puerto (9100 típico) con node:net
//   - windows-printer: spooler RAW de Windows vía P/Invoke (PowerShell)
//   - usb            : igual que windows-printer (la USB instalada en Windows)
//   - serial         : "mode COMx" + "copy /b" (cmd)
//
// Es STATELESS: el renderer pasa la PrinterConfig en cada llamada.
// Devuelve siempre { ok: boolean, error?: string } (nunca lanza al IPC).
// =====================================================================

const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const escpos = require('../escpos/escpos.cjs');

const isWindows = process.platform === 'win32';

/* ----------------------------- Utilidades -------------------------- */

function tempFile(ext) {
  return path.join(os.tmpdir(), `aurora-tpv-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
}

function runFile(cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs || 15000, windowsHide: true }, (error, stdout, stderr) => {
      if (error) resolve({ ok: false, error: (stderr && String(stderr).trim()) || error.message });
      else resolve({ ok: true, stdout: String(stdout || '') });
    });
  });
}

/* --------------------------- Script RAW Windows -------------------- */
// P/Invoke a winspool.drv para enviar bytes RAW al spooler. Es la vía
// fiable para ESC/POS (Out-Printer NO garantiza datos binarios limpios).
const RAW_PS1 = `param([string]$PrinterName, [string]$FilePath)
$ErrorActionPreference = 'Stop'
$code = @'
using System;
using System.IO;
using System.Runtime.InteropServices;
public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public class DOCINFOW {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOW di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
  public static bool SendBytes(string printerName, byte[] bytes) {
    IntPtr hPrinter; int dwWritten = 0; bool ok = false;
    DOCINFOW di = new DOCINFOW();
    di.pDocName = "Aurora TPV Ticket"; di.pDataType = "RAW";
    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return false;
    if (StartDocPrinter(hPrinter, 1, di)) {
      if (StartPagePrinter(hPrinter)) {
        IntPtr pBytes = Marshal.AllocCoTaskMem(bytes.Length);
        Marshal.Copy(bytes, 0, pBytes, bytes.Length);
        ok = WritePrinter(hPrinter, pBytes, bytes.Length, out dwWritten);
        Marshal.FreeCoTaskMem(pBytes);
        EndPagePrinter(hPrinter);
      }
      EndDocPrinter(hPrinter);
    }
    ClosePrinter(hPrinter);
    return ok;
  }
}
'@
Add-Type -TypeDefinition $code -Language CSharp
$bytes = [System.IO.File]::ReadAllBytes($FilePath)
if (-not [RawPrinterHelper]::SendBytes($PrinterName, $bytes)) { throw "No se pudo escribir en la impresora (WritePrinter)" }
`;

let rawScriptPath = null;
function ensureRawScript() {
  if (rawScriptPath && fs.existsSync(rawScriptPath)) return rawScriptPath;
  rawScriptPath = path.join(os.tmpdir(), 'aurora-tpv-rawprint.ps1');
  fs.writeFileSync(rawScriptPath, RAW_PS1, 'utf8');
  return rawScriptPath;
}

/* ------------------------------ Transportes ------------------------ */

function sendNetwork(bytes, cfg) {
  return new Promise((resolve) => {
    const host = cfg.ipAddress;
    const port = Number(cfg.port) || 9100;
    if (!host) return resolve({ ok: false, error: 'Falta la dirección IP de la impresora de red' });
    let settled = false;
    const done = (res) => { if (!settled) { settled = true; try { socket.destroy(); } catch (_) {} resolve(res); } };
    const socket = net.createConnection({ host, port }, () => {
      socket.write(bytes, (err) => {
        if (err) done({ ok: false, error: 'Error al enviar a la impresora de red' });
        else socket.end();
      });
    });
    socket.setTimeout(5000, () => done({ ok: false, error: 'Tiempo de espera agotado con la impresora de red' }));
    socket.on('close', () => done({ ok: true }));
    socket.on('error', (err) => {
      const msg = err && err.code === 'ECONNREFUSED' ? 'La impresora rechazó la conexión (¿IP/puerto correctos?)'
        : err && err.code === 'EHOSTUNREACH' ? 'Impresora de red inalcanzable'
        : err && err.code === 'ETIMEDOUT' ? 'Tiempo de espera agotado'
        : (err && err.message) || 'Error de conexión de red';
      done({ ok: false, error: msg });
    });
  });
}

async function sendWindowsPrinter(bytes, cfg) {
  if (!isWindows) return { ok: false, error: 'La impresión por spooler solo está disponible en Windows' };
  if (!cfg.printerName) return { ok: false, error: 'No se ha seleccionado ninguna impresora de Windows' };
  const dataPath = tempFile('bin');
  try {
    fs.writeFileSync(dataPath, bytes);
    const script = ensureRawScript();
    const res = await runFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, cfg.printerName, dataPath], 20000);
    if (!res.ok) {
      const e = res.error || '';
      if (/OpenPrinter|no se pudo|cannot find|not found/i.test(e)) return { ok: false, error: `Impresora no encontrada: ${cfg.printerName}` };
      return { ok: false, error: `Error de impresión: ${e}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : 'Error al preparar la impresión' };
  } finally {
    fs.unlink(dataPath, () => {});
  }
}

async function sendSerial(bytes, cfg) {
  if (!isWindows) return { ok: false, error: 'La impresión por puerto serie solo está disponible en Windows' };
  const port = cfg.serialPort || 'COM1';
  const baud = Number(cfg.baudRate) || 9600;
  const dataPath = tempFile('bin');
  try {
    fs.writeFileSync(dataPath, bytes);
    const cmd = `mode ${port}: BAUD=${baud} PARITY=N DATA=8 STOP=1 & copy /b "${dataPath}" ${port}:`;
    const res = await runFile('cmd', ['/c', cmd], 15000);
    if (!res.ok) return { ok: false, error: `Error en el puerto ${port}: ${res.error}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : 'Error al escribir en el puerto serie' };
  } finally {
    fs.unlink(dataPath, () => {});
  }
}

/** Envía un Buffer de bytes por el transporte indicado en la config. */
async function sendBytes(bytes, cfg) {
  const type = (cfg && cfg.connectionType) || 'windows-printer';
  try {
    if (type === 'network') return await sendNetwork(bytes, cfg);
    if (type === 'serial') return await sendSerial(bytes, cfg);
    // 'usb' y 'windows-printer' usan el spooler de Windows.
    return await sendWindowsPrinter(bytes, cfg);
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : 'Error de impresión desconocido' };
  }
}

/* ------------------------------ API pública ------------------------ */

/** Lista las impresoras instaladas en Windows. */
async function getPrinters() {
  if (!isWindows) return [];
  const ps = await runFile('powershell', ['-NoProfile', '-Command',
    'Get-Printer | Select-Object Name,PortName,@{n=\'Type\';e={[string]$_.Type}} | ConvertTo-Json -Compress'], 12000);
  if (ps.ok && ps.stdout && ps.stdout.trim()) {
    try {
      const parsed = JSON.parse(ps.stdout.trim());
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      return arr.map((p) => ({ name: p.Name, port: p.PortName || '', type: p.Type || '' }));
    } catch (_) { /* cae al fallback */ }
  }
  // Fallback: wmic (obsoleto pero presente en muchos Windows).
  const wmic = await runFile('cmd', ['/c', 'wmic printer get Name,PortName /format:csv'], 12000);
  if (wmic.ok && wmic.stdout) {
    const lines = wmic.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const rows = lines.slice(1).map((l) => l.split(','));
    return rows.filter((c) => c.length >= 3 && c[1]).map((c) => ({ name: c[1], port: c[2] || '', type: '' }));
  }
  return [];
}

async function printReceipt(payload, cfg) {
  const copies = Math.max(1, Number(cfg && cfg.copies) || 1);
  const isCopy = payload && payload.type === 'COPY';
  const bytes = escpos.buildReceiptBytes(payload, cfg);
  let last = { ok: true };
  // Las COPIAS se imprimen siempre una sola vez.
  const n = isCopy ? 1 : copies;
  for (let i = 0; i < n; i++) {
    last = await sendBytes(bytes, cfg);
    if (!last.ok) return last;
  }
  return last;
}

async function cutPaper(cfg) {
  const bytes = Buffer.concat([escpos.CMD.LF, escpos.CMD.LF, escpos.cut(false)]);
  return sendBytes(bytes, cfg);
}

async function testPrinter(cfg, store) {
  return sendBytes(escpos.buildTestTicket(cfg, store), cfg);
}

async function testFullReceipt(cfg, store) {
  return sendBytes(escpos.buildSampleReceipt(cfg, store), cfg);
}

module.exports = {
  getPrinters,
  printReceipt,
  cutPaper,
  testPrinter,
  testFullReceipt,
  sendBytes,
};
