'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2 } from 'lucide-react'

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
  const [milestones, setMilestones] = useState([
    { id: '1', title: '', description: '', amount: '' }
  ])

  const { register, handleSubmit, formState: { errors } } = useForm<WorkspaceFormData>({
    resolver: zodResolver(workspaceSchema),
    defaultValues: {
      currency: 'USDC',
      htlcDuration: 72, // 72 hours default
    }
  })

  const addMilestone = () => {
    setMilestones([...milestones, { 
      id: Date.now().toString(), 
      title: '', 
      description: '', 
      amount: '' 
    }])
  }

  const removeMilestone = (id: string) => {
    if (milestones.length > 1) {
      setMilestones(milestones.filter(m => m.id !== id))
    }
  }

  const onSubmit = async (data: WorkspaceFormData) => {
    console.log('Creating workspace:', data)
    // Implementation will connect to 1inch Fusion+ and Sui Move contract
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
              className="mt-1 w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
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
                className="mt-1 w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {errors.totalAmount && (
                <p className="text-sm text-destructive mt-1">{errors.totalAmount.message}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium">Currency</label>
              <select
                {...register('currency')}
                className="mt-1 w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
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
              className="mt-1 w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
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
            <Button type="button" onClick={addMilestone} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Milestone
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {milestones.map((milestone, index) => (
            <div key={milestone.id} className="p-4 border rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant="outline">Milestone {index + 1}</Badge>
                {milestones.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeMilestone(milestone.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>

              <div>
                <input
                  {...register(`milestones.${index}.title`)}
                  placeholder="Milestone title"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <textarea
                  {...register(`milestones.${index}.description`)}
                  placeholder="Milestone description"
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <input
                  {...register(`milestones.${index}.amount`)}
                  type="number"
                  step="0.01"
                  placeholder="Amount for this milestone"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Button type="submit" size="lg" className="w-full">
        Create Workspace & Lock Funds
      </Button>
    </form>
  )
}
