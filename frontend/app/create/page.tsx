'use client'

import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { CreateWorkspaceForm } from '@/components/workspace/create-workspace-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function CreateWorkspacePage() {
  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Create Workspace</h1>
            <p className="text-muted-foreground">Set up a new cross-chain freelance escrow</p>
          </div>
        </div>

        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              ⚡ One-Click Gas Onboarding
            </CardTitle>
            <CardDescription>
              When funds are transferred to Sui, we automatically swap $1 of USDC to native SUI tokens
              so the freelancer has gas to claim their payment immediately. Zero friction!
            </CardDescription>
          </CardHeader>
        </Card>

        <CreateWorkspaceForm />
      </div>
    </DashboardLayout>
  )
}
