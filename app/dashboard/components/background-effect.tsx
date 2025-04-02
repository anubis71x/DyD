"use client";

import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";

interface Particle {
    id: number;
    x: number;
    y: number;
    size: number;
    color: string;
    opacity: number;
    speed: number;
    angle: number; // Añadimos ángulo para movimiento más natural
}

export const BackgroundEffect = () => {
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
    const [particles, setParticles] = useState<Particle[]>([]);
    const requestRef = useRef<number>();
    const containerRef = useRef<HTMLDivElement>(null);

    // Aumentamos la opacidad de los colores
    const colors = [
        "rgba(255, 215, 0, 0.5)",  // Dorado místico
    ];

    // Inicializar partículas
    useEffect(() => {
        if (!containerRef.current) return;

        const width = window.innerWidth;
        const height = window.innerHeight;

        const newParticles: Particle[] = [];

        // Aumentamos el número de partículas
        for (let i = 0; i < 100; i++) {
            newParticles.push({
                id: i,
                x: Math.random() * width,
                y: Math.random() * height,
                size: Math.random() * 8 + 3, // Partículas más grandes
                color: colors[Math.floor(Math.random() * colors.length)],
                opacity: Math.random() * 0.8 + 0.4, // Mayor opacidad
                speed: Math.random() * 0.8 + 0.3, // Velocidad aumentada
                angle: Math.random() * Math.PI * 2,
            });
        }

        setParticles(newParticles);

        const handleResize = () => {
            if (containerRef.current) {
                const width = window.innerWidth;
                const height = window.innerHeight;
                setParticles(prev =>
                    prev.map(particle => ({
                        ...particle,
                        x: Math.min(particle.x, width),
                        y: Math.min(particle.y, height),
                    }))
                );
            }
        };

        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    // Animación de partículas mejorada
    useEffect(() => {
        const animateParticles = () => {
            setParticles(prevParticles => {
                return prevParticles.map(particle => {
                    const dx = mousePosition.x - particle.x;
                    const dy = mousePosition.y - particle.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    let newX = particle.x;
                    let newY = particle.y;

                    // Interacción con el mouse más suave
                    if (distance < 300) {
                        const angle = Math.atan2(dy, dx);
                        const force = (300 - distance) / 3000;
                        newX += Math.cos(angle) * force * 10;
                        newY += Math.sin(angle) * force * 10;
                    }

                    // Movimiento más natural
                    particle.angle += particle.speed * 0.02;
                    newX += Math.cos(particle.angle) * particle.speed;
                    newY += Math.sin(particle.angle) * particle.speed;

                    // Mantener partículas dentro de la pantalla
                    const width = window.innerWidth;
                    const height = window.innerHeight;

                    if (newX < 0) newX = width;
                    if (newX > width) newX = 0;
                    if (newY < 0) newY = height;
                    if (newY > height) newY = 0;

                    return {
                        ...particle,
                        x: newX,
                        y: newY,
                        angle: particle.angle,
                    };
                });
            });

            requestRef.current = requestAnimationFrame(animateParticles);
        };

        requestRef.current = requestAnimationFrame(animateParticles);
        return () => {
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
            }
        };
    }, [mousePosition]);

    // Seguimiento del mouse
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            setMousePosition({ x: e.clientX, y: e.clientY });
        };

        window.addEventListener("mousemove", handleMouseMove);
        return () => window.removeEventListener("mousemove", handleMouseMove);
    }, []);

    return (
        <div
            ref={containerRef}
            className="fixed inset-0 w-full h-full overflow-hidden pointer-events-none z-[-1]"
        >
            <div className="absolute inset-0 bg-gradient-to-br from-[#1a0f1f] via-[#261a2d] to-[#1f1a2d]">
                <div className="absolute inset-0 bg-[url('https://images.ctfassets.net/swt2dsco9mfe/22Xj1YPLa19KYGAOGcAhbb/014bde378bc8e710eb15fb7fc99e5d0c/1920x1080-terrain-wa.jpg')] opacity-30 mix-blend-overlay" />
            </div>

            {particles.map(particle => (
                <motion.div
                    key={particle.id}
                    className="absolute rounded-full backdrop-blur-sm"
                    style={{
                        width: particle.size,
                        height: particle.size,
                        backgroundColor: particle.color,
                        boxShadow: `
                  0 0 ${particle.size * 2}px ${particle.color},
                  0 0 ${particle.size * 4}px ${particle.color},
                  inset 0 0 ${particle.size}px rgba(255,255,255,0.5)
                `,
                        transform: `translate(${particle.x}px, ${particle.y}px)`,
                        filter: 'blur(0.5px)',
                    }}
                />
            ))}

            {/* Mantenemos los elementos decorativos con mayor opacidad */}
            <div className="absolute top-1/4 left-1/4 w-32 h-32 opacity-15 bg-[url('/dragon-silhouette.png')] bg-contain bg-no-repeat filter brightness-75" />
            <div className="absolute bottom-1/4 right-1/4 w-24 h-24 opacity-15 bg-[url('/sword-icon.png')] bg-contain bg-no-repeat filter brightness-75" />
            <div className="absolute top-3/4 left-1/3 w-20 h-20 opacity-15 bg-[url('/dice-d20.png')] bg-contain bg-no-repeat filter brightness-75" />
        </div>
    );
};