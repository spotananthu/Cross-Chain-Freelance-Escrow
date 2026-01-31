'use client'

import { motion } from 'framer-motion'
import { PlusSquare, ArrowRightLeft, Zap, Wallet } from 'lucide-react'

const steps = [
  {
    step: 1,
    title: 'Client Creates Workspace',
    description: 'Client (EVM) creates an escrow with milestones. Funds are locked via 1inch Fusion+.',
    icon: PlusSquare,
  },
  {
    step: 2,
    title: 'Cross-Chain Transfer',
    description: 'USDC automatically moves from EVM to Sui using HTLC atomic swap.',
    icon: ArrowRightLeft,
  },
  {
    step: 3,
    title: 'Gasless Milestone Approvals',
    description: 'Yellow Network state channels enable zero-gas work approvals.',
    icon: Zap,
  },
  {
    step: 4,
    title: 'Automated Payouts',
    description: 'Freelancer (Sui) receives payment directly to their wallet upon approval.',
    icon: Wallet,
  },
]

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
    },
  },
}

const cardVariants = {
  hidden: { 
    opacity: 0, 
    y: 100,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 100,
      damping: 20,
    },
  },
}

export function HowItWorks() {
  return (
    <section className="py-24 px-4">
      <div className="container mx-auto max-w-6xl">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-6xl font-black mb-4 text-black dark:text-white tracking-tight">
            HOW IT WORKS
          </h2>
          <p className="text-neutral-600 dark:text-neutral-400 text-lg max-w-2xl mx-auto font-medium">
            Secure cross-chain payments in four simple steps
          </p>
        </motion.div>

        {/* Cards Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {steps.map((step) => (
            <motion.div
              key={step.step}
              variants={cardVariants}
              className="group relative"
            >
              {/* Bold Black & White Card */}
              <div className="relative h-full p-6 rounded-none overflow-hidden
                bg-white dark:bg-black
                border-2 border-black dark:border-white
                hover:bg-black hover:text-white
                dark:hover:bg-white dark:hover:text-black
                transition-all duration-300
                hover:-translate-y-2"
              >
                {/* Step Number Badge */}
                <div className="absolute top-4 right-4 w-10 h-10 rounded-full border-2 border-black dark:border-white group-hover:border-white dark:group-hover:border-black flex items-center justify-center transition-colors">
                  <span className="text-lg font-black text-black dark:text-white group-hover:text-white dark:group-hover:text-black transition-colors">{step.step}</span>
                </div>

                {/* Icon */}
                <div className="relative mb-4 w-14 h-14 rounded-none bg-black dark:bg-white flex items-center justify-center group-hover:bg-white dark:group-hover:bg-black transition-colors">
                  <step.icon className="w-7 h-7 text-white dark:text-black group-hover:text-black dark:group-hover:text-white transition-colors" />
                </div>

                {/* Content */}
                <div className="relative">
                  <h3 className="text-lg font-bold mb-2 text-black dark:text-white group-hover:text-white dark:group-hover:text-black transition-colors uppercase tracking-wide">
                    {step.title}
                  </h3>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400 group-hover:text-neutral-300 dark:group-hover:text-neutral-700 leading-relaxed transition-colors">
                    {step.description}
                  </p>
                </div>

                {/* Bottom Accent Line */}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-black dark:bg-white group-hover:bg-white dark:group-hover:bg-black transform scale-x-0 group-hover:scale-x-100 transition-all duration-300 origin-left" />
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Connection Lines (Desktop Only) */}
        <div className="hidden lg:flex justify-center mt-8">
          <motion.div
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1, delay: 0.5 }}
            className="h-0.5 w-3/4 bg-black dark:bg-white origin-left"
          />
        </div>
      </div>
    </section>
  )
}
