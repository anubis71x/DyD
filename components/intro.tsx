"use client"
import { useState } from "react"
import { Check, ChevronLeft, ChevronRight, Play, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import axios from "axios"

interface Step {
    title: string
    description: string
    image?: string
}

const steps: Step[] = [
    {
        title: "Start Adventure",
        description: "Click on 'Start Adventure' to proceed to master selection.",
        image: "https://i.ibb.co/ZzKq3fhs/Captura-de-pantalla-2025-03-25-235813.png",
    },
    {
        title: "Select a Master",
        description: "Choose a master to guide your Dungeon and Dragons adventure.",
        image: "https://i.ibb.co/5XLGjPRy/Captura-de-pantalla-2025-03-25-235852.png",
    },
    {
        title: "Begin Call",
        description: "Initiate the call to commence your epic adventure.",
        image: "https://i.ibb.co/Cp4CkNKB/parte3.png",
    },
]

interface DashboardIntroModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function DashboardIntroModal({ open, onOpenChange }: DashboardIntroModalProps) {
    const [currentStep, setCurrentStep] = useState(0)
    const [showVideo, setShowVideo] = useState(false)

    const handleNext = async () => {
        if (currentStep < steps.length - 1) {
            setCurrentStep(currentStep + 1)
        } else {
            // Actualiza que el usuario ya vio el tutorial
            try {
             const data=  await axios.put("/api/user", { isNewUser: false })
             console.log(data);
             
            } catch (error) {
              console.error("Error actualizando estado del tutorial:", error)
            }
            onOpenChange(false)
            setCurrentStep(0)
        }
    }

    const handlePrevious = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1)
        }
    }

    const handleSkip = () => {
        onOpenChange(false)
        setCurrentStep(0)
    }

    const toggleVideo = () => {
        setShowVideo(!showVideo)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle className="text-xl">{steps[currentStep].title}</DialogTitle>
                    <DialogDescription>{steps[currentStep].description}</DialogDescription>
                </DialogHeader>

                                <div className="my-6">
                    <img
                        src={steps[currentStep].image}
                        alt={`Step ${currentStep + 1}`}
                        className="rounded-md w-full h-auto"
                    />
                </div>

                <div className="flex items-center justify-center gap-1 my-2">
                    {steps.map((_, index) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
                        <span key={index} className={`h-2 w-2 rounded-full ${index === currentStep ? "bg-primary" : "bg-muted"}`} />
                    ))}
                </div>

                <DialogFooter className="flex sm:justify-between">
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={handlePrevious} disabled={currentStep === 0}>
                            <ChevronLeft className="mr-1 h-4 w-4" />
                            Previous
                        </Button>
                        <Button onClick={handleNext}>
                            {currentStep === steps.length - 1 ? (
                                <>
                                    <Check className="mr-1 h-4 w-4" />
                                    Finish
                                </>
                            ) : (
                                <>
                                    Next
                                    <ChevronRight className="ml-1 h-4 w-4" />
                                </>
                            )}
                        </Button>
                    </div>
                    <Button variant="ghost" onClick={handleSkip}>
                        Skip
                        <X className="ml-1 h-4 w-4" />
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

