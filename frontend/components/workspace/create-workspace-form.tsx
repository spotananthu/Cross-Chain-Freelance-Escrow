'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useAccount } from 'wagmi'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Loader2, AlertCircle } from 'lucide-react'
import { useAuth } from '@/providers'
import { useEscrowActions } from '@/lib/hooks/useEscrows'
import { useWorkspaceStore } from '@/store/workspace-store'

const milestoneSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  amount: z.string().min(1, 'Amount is required'),
})

const workspaceSchema = z.object({
  freelancerAddress: z.string().min(10, 'Valid address required'),
  totalAmount: z.string().min(1, 'Amount is required'),
  currency: z.enum(['USDC', 'USDT']),
  milestones: z.array(milestoneSchema).min(1, 'At least one milestone required'),
  htlcDuration: z.number().min(1, 'HTLC duration must be at least 1 hour'),
})

type WorkspaceFormData = z.infer<typeof workspaceSchema>

export function CreateWorkspaceForm() {
  const router = useRouter()
  const { address } = useAccount()
  const { isAuthenticated, authenticate, isAuthenticating } = useAuth()
  const { createEscrow, loading: isLoading, error } = useEscrowActions()
  const addWorkspace = useWorkspaceStore(state => state.addWorkspace)
  
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm<WorkspaceFormData>({
    resolver: zodResolver(workspaceSchema),
    defaultValues: {
      currency: 'USDC',
      htlcDuration: 72, // 72 hours default
      milestones: [{ title: '', description: '', amount: '' }],
    }
  })

  // Use useFieldArray to properly manage the milestones array
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'milestones',
  })

  // Debug: Log form errors
  console.log('Form errors:', errors)

  const addMilestone = () => {
    append({ title: '', description: '', amount: '' })
  }

  const removeMilestone = (index: number) => {
    if (fields.length > 1) {
      remove(index)
    }
  }

  const onSubmit = async (data: WorkspaceFormData) => {
    setSubmitError(null)
    
    if (!address) {
      setSubmitError('Please connect your wallet')
      return
    }

    // Auto-authenticate if not authenticated
    if (!isAuthenticated) {
      const authSuccess = await authenticate()
      if (!authSuccess) {
        setSubmitError('Please sign in to create a workspace')
        return
      }
    }

    try {
      // Create escrow via API
      const escrow = await createEscrow({
        clientAddress: address,
        freelancerAddress: data.freelancerAddress,
        totalAmount: data.totalAmount,
        currency: data.currency,
        title: data.milestones[0]?.title || 'New Project',
        description: data.milestones[0]?.description || 'Project description',
        milestones: data.milestones.map((m, index) => ({
          title: m.title,
          description: m.description,
          amount: m.amount,
          order: index,
        })),
      })

      if (escrow) {
        // Add to local store for immediate UI update
        addWorkspace({
          id: escrow.id,
          clientAddress: escrow.clientAddress,
          freelancerAddress: escrow.freelancerAddress,
          totalAmount: escrow.totalAmount,
          currency: escrow.currency,
          status: escrow.status as any,
          milestones: escrow.milestones?.map(m => ({
            id: m.id,
            title: m.title,
            description: m.description || '',
            amount: m.amount,
            status: m.status as any,
          })) || [],
          secretHash: '',
          htlcExpiry: Date.now() + (data.htlcDuration * 60 * 60 * 1000),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })

        // Navigate to dashboard
        router.push('/dashboard')
      }
    } catch (err) {
      console.error('Error creating workspace:', err)
      setSubmitError(err instanceof Error ? err.message : 'Failed to create workspace')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Workspace Details</CardTitle>
          <CardDescription>
            Set up a new cross-chain escrow workspace
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Freelancer Address (Sui)</label>
            <input
              {...register('freelancerAddress')}
              placeholder="0x..."
              className="mt-1 w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.freelancerAddress && (
              <p className="text-sm text-destructive mt-1">{errors.freelancerAddress.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Total Amount</label>
              <input
                {...register('totalAmount')}
                type="number"
                step="0.01"
                placeholder="1000"
                className="mt-1 w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {errors.totalAmount && (
                <p className="text-sm text-destructive mt-1">{errors.totalAmount.message}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium">Currency</label>
              <select
                {...register('currency')}
                className="mt-1 w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="USDC">USDC</option>
                <option value="USDT">USDT</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">HTLC Lock Duration (hours)</label>
            <input
              {...register('htlcDuration', { valueAsNumber: true })}
              type="number"
              placeholder="72"
              className="mt-1 w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.htlcDuration && (
              <p className="text-sm text-destructive mt-1">{errors.htlcDuration.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Milestones</CardTitle>
              <CardDescription>Define payment milestones for this project</CardDescription>
            </div>
            <Button type="button" onClick={addMilestone} size="sm" variant="outline" className="text-foreground">
              <Plus className="h-4 w-4 mr-2" />
              Add Milestone
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {fields.map((field, index) => (
            <div key={field.id} className="p-4 border rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant="outline">Milestone {index + 1}</Badge>
                {fields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeMilestone(index)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">Title</label>
                <input
                  {...register(`milestones.${index}.title`)}
                  placeholder="Milestone title"
                  className="mt-1 w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">Description</label>
                <textarea
                  {...register(`milestones.${index}.description`)}
                  placeholder="Milestone description (at least 10 characters)"
                  rows={3}
                  className="mt-1 w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">Amount</label>
                <input
                  {...register(`milestones.${index}.amount`)}
                  type="number"
                  step="0.01"
                  placeholder="Amount for this milestone"
                  className="mt-1 w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Error Display */}
      {(submitError || error) && (
        <div className="flex items-center gap-2 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm">{submitError || error}</p>
        </div>
      )}

      {/* Form validation errors */}
      {Object.keys(errors).length > 0 && (
        <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-600">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium">Please fix the following errors:</p>
            <ul className="list-disc ml-4 mt-1">
              {errors.freelancerAddress && <li>Freelancer address: {errors.freelancerAddress.message}</li>}
              {errors.totalAmount && <li>Total amount: {errors.totalAmount.message}</li>}
              {errors.milestones && <li>Milestones: {errors.milestones.message || 'Please fill in all milestone fields'}</li>}
            </ul>
          </div>
        </div>
      )}

      <Button 
        type="submit" 
        size="lg" 
        className="w-full bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90 font-bold"
        disabled={isLoading || isAuthenticating || isSubmitting}
      >
        {isLoading || isAuthenticating || isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            {isAuthenticating ? 'Authenticating...' : 'Creating Workspace...'}
          </>
        ) : (
          'Create Workspace & Lock Funds'
        )}
      </Button>
    </form>
  )
}
