'use client'

import { useState } from 'react'
import { Step1 } from '@/components/submit/step1'
import { Step2 } from '@/components/submit/step2'

export default function SubmitPage() {
  const [step, setStep] = useState<1 | 2>(1)

  return (
    <div>
      {step === 1 ? (
        <Step1 onNext={() => setStep(2)} />
      ) : (
        <Step2 onBack={() => setStep(1)} />
      )}
    </div>
  )
}
