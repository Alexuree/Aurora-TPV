// =====================================================================
// Hooks de datos (TanStack Query). Encapsulan el acceso al repositorio
// con caché, estados de carga e invalidación automática.
// =====================================================================

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repo } from '@/data';
import type {
  AdjustStockInput,
  CashMovementInput,
  CloseCashInput,
  OpenCashInput,
  ProcessReturnInput,
  ProcessSaleInput,
  SalesFilter,
} from '@/data/repository';
import type { Category, Customer, Product, Settings, User } from '@/domain/types';

export const qk = {
  products: ['products'] as const,
  categories: ['categories'] as const,
  customers: ['customers'] as const,
  settings: ['settings'] as const,
  users: ['users'] as const,
  sales: (f?: SalesFilter) => ['sales', f ?? {}] as const,
  returns: ['returns'] as const,
  openCash: ['cash', 'open'] as const,
  cashSessions: ['cash', 'sessions'] as const,
  cashMovements: (id: string) => ['cash', 'movements', id] as const,
  stockMovements: (id?: string) => ['stock', id ?? 'all'] as const,
};

/* ----------------------------- Queries -------------------------------- */

export const useProducts = () => useQuery({ queryKey: qk.products, queryFn: () => repo.listProducts() });
export const useCategories = () => useQuery({ queryKey: qk.categories, queryFn: () => repo.listCategories() });
export const useCustomers = () => useQuery({ queryKey: qk.customers, queryFn: () => repo.listCustomers() });
export const useSettings = () => useQuery({ queryKey: qk.settings, queryFn: () => repo.getSettings() });
export const useUsers = () => useQuery({ queryKey: qk.users, queryFn: () => repo.listUsers() });
export const useSales = (filter?: SalesFilter) =>
  useQuery({ queryKey: qk.sales(filter), queryFn: () => repo.listSales(filter) });
export const useReturns = () => useQuery({ queryKey: qk.returns, queryFn: () => repo.listReturns() });
export const useOpenCashSession = () => useQuery({ queryKey: qk.openCash, queryFn: () => repo.getOpenCashSession() });
export const useCashSessions = () => useQuery({ queryKey: qk.cashSessions, queryFn: () => repo.listCashSessions() });
export const useCashMovements = (sessionId?: string) =>
  useQuery({
    queryKey: qk.cashMovements(sessionId ?? ''),
    queryFn: () => repo.listCashMovements(sessionId!),
    enabled: !!sessionId,
  });
export const useStockMovements = (productId?: string) =>
  useQuery({ queryKey: qk.stockMovements(productId), queryFn: () => repo.listStockMovements(productId) });

/* ---------------------------- Mutations ------------------------------- */

function useInvalidate() {
  const qc = useQueryClient();
  return (keys: readonly (readonly unknown[])[]) =>
    keys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
}

export function useProcessSale() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: ProcessSaleInput) => repo.processSale(input),
    onSuccess: () => invalidate([qk.products, ['sales'], qk.openCash, ['stock']]),
  });
}

export function useProcessReturn() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: ProcessReturnInput) => repo.processReturn(input),
    onSuccess: () => invalidate([qk.products, ['sales'], qk.returns, ['stock']]),
  });
}

export function useSaveProduct() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (p: Product) => repo.saveProduct(p),
    onSuccess: () => invalidate([qk.products]),
  });
}
export function useDeleteProduct() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => repo.deleteProduct(id), onSuccess: () => invalidate([qk.products]) });
}
export function useAdjustStock() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: AdjustStockInput) => repo.adjustStock(input),
    onSuccess: () => invalidate([qk.products, ['stock']]),
  });
}

export function useSaveCategory() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (c: Category) => repo.saveCategory(c), onSuccess: () => invalidate([qk.categories]) });
}
export function useDeleteCategory() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => repo.deleteCategory(id), onSuccess: () => invalidate([qk.categories]) });
}

export function useSaveCustomer() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (c: Customer) => repo.saveCustomer(c), onSuccess: () => invalidate([qk.customers]) });
}
export function useDeleteCustomer() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => repo.deleteCustomer(id), onSuccess: () => invalidate([qk.customers]) });
}

export function useSaveUser() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (u: User) => repo.saveUser(u), onSuccess: () => invalidate([qk.users]) });
}
export function useDeleteUser() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => repo.deleteUser(id), onSuccess: () => invalidate([qk.users]) });
}

export function useOpenCash() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: OpenCashInput) => repo.openCashSession(input),
    onSuccess: () => invalidate([qk.openCash, qk.cashSessions]),
  });
}
export function useCloseCash() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CloseCashInput) => repo.closeCashSession(input),
    onSuccess: () => invalidate([qk.openCash, qk.cashSessions]),
  });
}
export function useAddCashMovement() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CashMovementInput) => repo.addCashMovement(input),
    onSuccess: () => invalidate([['cash']]),
  });
}

export function useSaveSettings() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (s: Settings) => repo.saveSettings(s), onSuccess: () => invalidate([qk.settings]) });
}
