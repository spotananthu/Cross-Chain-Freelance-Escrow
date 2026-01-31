import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type WorkspaceStatus = 'PENDING' | 'LOCKED' | 'IN_PROGRESS' | 'COMPLETED' | 'REFUNDED' | 'DISPUTED'

export interface Milestone {
  id: string
  title: string
  description: string
  amount: string
  status: 'PENDING' | 'IN_PROGRESS' | 'SUBMITTED' | 'APPROVED' | 'PAID'
  dueDate?: number
  submittedAt?: number
  approvedAt?: number
}

export interface Workspace {
  id: string
  clientAddress: string
  clientEnsName?: string
  freelancerAddress: string
  freelancerEnsName?: string
  totalAmount: string
  currency: string
  status: WorkspaceStatus
  milestones: Milestone[]
  secretHash: string
  htlcExpiry: number
  createdAt: number
  updatedAt: number
  txHash?: string
  suiObjectId?: string
}

export interface Transaction {
  id: string
  workspaceId: string
  type: 'CREATE' | 'DEPOSIT' | 'RELEASE' | 'REFUND' | 'DISPUTE'
  status: 'PENDING' | 'CONFIRMED' | 'FAILED'
  txHash: string
  network: 'ethereum' | 'base' | 'sui'
  amount?: string
  timestamp: number
}

interface WorkspaceStore {
  workspaces: Workspace[]
  transactions: Transaction[]
  activeWorkspace: Workspace | null
  
  addWorkspace: (workspace: Workspace) => void
  updateWorkspace: (id: string, updates: Partial<Workspace>) => void
  setActiveWorkspace: (workspace: Workspace | null) => void
  addTransaction: (transaction: Transaction) => void
  updateTransaction: (id: string, updates: Partial<Transaction>) => void
}

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set) => ({
      workspaces: [],
      transactions: [],
      activeWorkspace: null,

      addWorkspace: (workspace) =>
        set((state) => ({
          workspaces: [workspace, ...state.workspaces],
        })),

      updateWorkspace: (id, updates) =>
        set((state) => ({
          workspaces: state.workspaces.map((w) =>
            w.id === id ? { ...w, ...updates, updatedAt: Date.now() } : w
          ),
          activeWorkspace:
            state.activeWorkspace?.id === id
              ? { ...state.activeWorkspace, ...updates, updatedAt: Date.now() }
              : state.activeWorkspace,
        })),

      setActiveWorkspace: (workspace) =>
        set({ activeWorkspace: workspace }),

      addTransaction: (transaction) =>
        set((state) => ({
          transactions: [transaction, ...state.transactions],
        })),

      updateTransaction: (id, updates) =>
        set((state) => ({
          transactions: state.transactions.map((t) =>
            t.id === id ? { ...t, ...updates } : t
          ),
        })),
    }),
    {
      name: 'workspace-storage',
    }
  )
)
