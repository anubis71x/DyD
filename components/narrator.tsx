"use client";
import React from 'react';
import { motion } from 'framer-motion';
import { Info } from 'lucide-react';
import useStore from '@/hooks/use-store';
import { Card, CardContent } from "@/components/ui/card";

export default function Narrator() {
    const { narrator } = useStore();
    
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="w-full p-4"
        >
            <Card className="border-none shadow-lg">
                <CardContent >
                    <p className="text-lg text-muted-foreground flex gap-2 items-center">
                       <Info/> <span className="font-medium">{narrator}</span>
                    </p>
                </CardContent>
            </Card>
        </motion.div>
    );
}