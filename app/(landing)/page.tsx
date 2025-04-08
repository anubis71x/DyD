"use client"

import { useEffect, useState, useRef } from "react"
import { Swiper, SwiperSlide } from "swiper/react"
import { Mousewheel, EffectFade, Pagination } from "swiper/modules"
import { motion, AnimatePresence } from "framer-motion"
import Image from "next/image"
import { ChevronDown, Play, Scroll, Users, Wand2, Swords } from "lucide-react"

// Import Swiper styles
import "swiper/css"
import "swiper/css/effect-fade"
import "swiper/css/pagination"
import { useRouter } from "next/navigation"

// AI Features data
const aiFeatures = [
  {
    name: "ADVENTURE GENERATOR",
    description: "Create epic quests in seconds",
    image: "https://i.ibb.co/MxBtBCrp/DALL-E-2025-03-26-23-59-04-A-fantasy-themed-illustration-of-an-Adventure-Generator-concept-The-image.webp",
  },
  {
    name: "NPC CREATOR",
    description: "Bring unique characters to life",
    image: "https://i.ibb.co/3y3t4Hf3/npc.webp",
  },
  {
    name: "WORLD BUILDER",
    description: "Craft immersive realms and cities",
    image: "https://i.ibb.co/QvbRsxTK/world.webp",
  },
  {
    name: "COMBAT ASSISTANT",
    description: "Manage epic battles with ease",
    image: "https://i.ibb.co/MD54Bfpz/8ca46b50-151e-42d2-8214-43287a07d1ee.png",
  
  },
]



export default function DndAiLanding() {
  const [activeIndex, setActiveIndex] = useState(0)
  const router = useRouter()
  const [isLoaded, setIsLoaded] = useState(false)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const particlesRef = useRef<HTMLDivElement>(null)
  const [hoveredFeature, setHoveredFeature] = useState<string | null>(null)

  // Track mouse position for parallax effects
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY })

      // Move particles based on mouse position
      if (particlesRef.current) {
        const particles = particlesRef.current.querySelectorAll(".particle")
        particles.forEach((particle) => {
          const speed = Number.parseFloat((particle as HTMLElement).dataset.speed || "0.5")
          const x = (window.innerWidth - e.clientX * speed) / 100
          const y = (window.innerHeight - e.clientY * speed) / 100
            ; (particle as HTMLElement).style.transform = `translate(${x}px, ${y}px)`
        })
      }
    }

    window.addEventListener("mousemove", handleMouseMove)
    return () => window.removeEventListener("mousemove", handleMouseMove)
  }, [])

  // Generate particles
  useEffect(() => {
    if (!particlesRef.current) return

    const particlesContainer = particlesRef.current
    particlesContainer.innerHTML = ""

    for (let i = 0; i < 50; i++) {
      const particle = document.createElement("div")
      particle.className = "particle"
      particle.dataset.speed = (Math.random() * 0.8 + 0.2).toString()

      const size = Math.random() * 3 + 1
      particle.style.width = `${size}px`
      particle.style.height = `${size}px`

      // Position randomly
      particle.style.left = `${Math.random() * 100}%`
      particle.style.top = `${Math.random() * 100}%`

      // Random opacity
      particle.style.opacity = (Math.random() * 0.5 + 0.1).toString()

      // Random color - purple or gold
      const isPurple = Math.random() > 0.7
      particle.style.backgroundColor = isPurple ? "#8E44AD" : "#F1C40F"

      particlesContainer.appendChild(particle)
    }

    setIsLoaded(true)
  }, [])

  // Sections data
  const sections = [
    {
      id: "hero",
      title: "dreampool.ai",
      subtitle: "",
      description:
        "An AI game master that dynamically runs your adventure in any setting or ruleset. Play solo or with friends—whether on PC or even on the go. Have your adventure anywhere—just talk, listen, and let the AI bring your world to life.",
      image: "https://i.ibb.co/JWY1Y8Zz/Sora-ezgif-com-video-to-gif-converter.gif",
      position: "center",
      badge: "NEW RELEASE",
      stats: [
        { label: "ADVENTURES", value: "Unlimited", icon: <Swords className="w-5 h-5" /> },
        { label: "WORLDS", value: "Infinite", icon: <Scroll className="w-5 h-5" /> },
        { label: "LANGUAGES", value: "32", icon: <Users className="w-5 h-5" /> },
      ],
    },
    {
      id: "features",
      title: "FORGE YOUR LEGEND",
      subtitle: "",
      description:
        "From generating intricate plot hooks to designing complex NPCs, our AI assistant provides you with the tools to create unforgettable dreampool experiences.",
      image: "https://i.ibb.co/JWY1Y8Zz/Sora-ezgif-com-video-to-gif-converter.gif",
      position: "right",
      showFeatures: true,
    },
    {
      id: "worldbuilding",
      title: "CRAFT EPIC REALMS",
      subtitle: "",
      description:
        "Design sprawling cities, mysterious dungeons, and entire planes of existence. Our AI helps you flesh out every detail, from local customs to ancient artifacts.",
      image: "https://i.ibb.co/JWY1Y8Zz/Sora-ezgif-com-video-to-gif-converter.gif",
      position: "left",
      badge: "WORLD BUILDER",
      stats: [
        { label: "LOCATIONS", value: "10K+", icon: <Wand2 className="w-5 h-5" /> },
        { label: "FACTIONS", value: "500+", icon: <Users className="w-5 h-5" /> },
        { label: "ARTIFACTS", value: "1000+", icon: <Swords className="w-5 h-5" /> },
      ],
    },
    // {
    //   id: "community",
    //   title: "JOIN THE GUILD",
    //   subtitle: "",
    //   description:
    //     "Share your creations, get inspired by others, and collaborate on epic campaigns. Our community of DMs and players is here to support and elevate your dreampool experience.",
    //   image: "https://images.ctfassets.net/swt2dsco9mfe/22Xj1YPLa19KYGAOGcAhbb/014bde378bc8e710eb15fb7fc99e5d0c/1920x1080-terrain-wa.jpg",
    //   position: "center",
    //   badge: "COMMUNITY",
    //   videoUrl: "#",
    // },
  ]

  return (
    <div className="h-screen w-full overflow-hidden bg-[#1A0933]">
      {/* Particles background */}
      <div ref={particlesRef} className="fixed inset-0 z-10 pointer-events-none" />

      {/* Decorative elements */}
      <div className="fixed top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#F1C40F] to-transparent opacity-70 z-50" />
      <div className="fixed bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#8E44AD] to-transparent opacity-70 z-50" />

      {isLoaded && (
        <>
          {/* Header */}
          <div className="fixed top-0 left-0 w-full z-50 px-6 py-4">
            <div className="flex justify-between items-center">
              <div className="text-[#F1C40F] font-bold text-2xl flex items-center">
                <div className="w-8 h-8 mr-2 relative">
                  <div className="absolute inset-0 bg-[#F1C40F] rounded-full opacity-20 animate-pulse" />
                  <div className="absolute inset-2 bg-[#F1C40F] rounded-full" />
                </div>
                <span className="relative">
                  dreampool 
                  <div className="absolute -bottom-1 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-[#F1C40F] to-transparent" />
                </span>
              </div>

              

              {/* biome-ignore lint/a11y/useButtonType: <explanation> */}
              <button className="bg-[#8E44AD] hover:bg-[#9B59B6] text-white font-bold xl:px-6 xl:py-2 px-3 py-2 rounded relative group overflow-hidden" onClick={()=> router.push('/dashboard')}>
                <span className="relative z-10">START ADVENTURING</span>
                <div className="absolute inset-0 bg-[#F1C40F] transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
              {/* inicio */}
              </button>
            </div>
          </div>

          {/* Main Swiper */}
          <Swiper
            direction="vertical"
            slidesPerView={1}
            spaceBetween={0}
            mousewheel={true}
            effect="fade"
            speed={800}
            pagination={{
              clickable: true,
              renderBullet: (index, className) =>
                `<span class="${className} w-2 h-2 bg-[#F1C40F] rounded-full"></span>`,
            }}
            modules={[Mousewheel, EffectFade, Pagination]}
            className="h-full w-full"
            onSlideChange={(swiper) => setActiveIndex(swiper.activeIndex)}
          >
            {sections.map((section, index) => (
              <SwiperSlide key={section.id} className="h-full w-full">
                <div className="relative h-full w-full">
                  {/* Background image with parallax effect */}
                  <div className="absolute inset-0 z-0 overflow-hidden">
                    <div
                      className="absolute inset-0 scale-110"
                      style={{
                        transform: `scale(1.1) translate(${(mousePosition.x - window.innerWidth / 2) / 50}px, ${(mousePosition.y - window.innerHeight / 2) / 50}px)`,
                        transition: "transform 0.2s ease-out",
                      }}
                    >
                      <Image
                        src={section.image || "/placeholder.svg"}
                        alt={section.title}
                        fill
                        className="object-cover"
                        priority
                      />
                    </div>
                    <div className="absolute inset-0 bg-[#1A0933]/70" />

                    {/* Decorative overlay */}
                    <div className="absolute inset-0 bg-[url('/placeholder.svg?height=400&width=400')] bg-repeat opacity-5" />

                    {/* Vignette effect */}
                    <div className="absolute inset-0 bg-radial-gradient" />
                  </div>

                  {/* Content */}
                  <AnimatePresence>
                    {activeIndex === index && (
                      <motion.div
                        className={`absolute inset-0 z-10 flex flex-col justify-center items-${section.position} px-6 md:px-20`}
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -50 }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                      >
                        <div className="max-w-2xl relative">
                          {/* Decorative elements */}
                          <div className="absolute -left-10 top-0 h-full w-1 bg-gradient-to-b from-transparent via-[#F1C40F] to-transparent opacity-70" />

                          {/* Badge */}
                          {section.badge && (
                            <motion.div
                              className="inline-block rounded-sm bg-[#2C3E50] border border-[#F1C40F] px-3 py-1 text-sm text-[#F1C40F] mb-4 relative overflow-hidden"
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.2, duration: 0.5 }}
                            >
                              <span className="relative z-10">{section.badge}</span>
                              <div className="absolute inset-0 bg-[#F1C40F] opacity-10" />
                              <div className="absolute -right-2 -top-2 w-10 h-10 bg-[#F1C40F] opacity-20 rounded-full" />
                            </motion.div>
                          )}

                          {/* Subtitle */}
                          <motion.div
                            className="text-[#8E44AD] mb-2 font-medium relative"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.3, duration: 0.5 }}
                          >
                            <span className="relative">
                              {section.subtitle}
                              <div className="absolute -bottom-1 left-0 w-1/3 h-px bg-[#8E44AD] opacity-50" />
                            </span>
                          </motion.div>

                          {/* Title */}
                          <motion.h2
                            className="text-4xl md:text-6xl lg:text-7xl font-bold text-[#FFF] mb-4 leading-tight relative glow-text-subtle"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.5, duration: 0.5 }}
                          >
                            {section.title}
                          </motion.h2>

                          {/* Description */}
                          <motion.p
                            className="text-[#ECF0F1] text-lg md:text-xl mb-8"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.7, duration: 0.5 }}
                          >
                            {section.description}
                          </motion.p>

                          {/* Stats */}
                          {section.stats && (
                            <motion.div
                              className="grid grid-cols-3 gap-4 mb-8"
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.8, duration: 0.5 }}
                            >
                              {section.stats.map((stat, i) => (
                                <div
                                  key={stat.label}
                                  className="bg-[#2C3E50]/80 border border-[#F1C40F]/30 p-3 rounded-sm flex flex-col items-center"
                                >
                                  <div className="text-[#F1C40F] mb-1">{stat.icon}</div>
                                  <div className="text-[#FFF] font-bold text-xl">{stat.value}</div>
                                  <div className="text-[#ECF0F1] text-xs">{stat.label}</div>
                                </div>
                              ))}
                            </motion.div>
                          )}

                          {/* AI Features showcase */}
                          {section.showFeatures && (
                            <motion.div
                              className="mb-8 overflow-hidden"
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.8, duration: 0.5 }}
                            >
                              <div className="flex space-x-4 py-4">
                                {aiFeatures.map((feature) => (
                                  <div
                                    key={feature.name}
                                    className="relative group"
                                    onMouseEnter={() => setHoveredFeature(feature.name)}
                                    onMouseLeave={() => setHoveredFeature(null)}
                                  >
                                    <div
                                      className={`w-24 h-32 md:w-32 md:h-44 relative overflow-hidden border-2 transition-all duration-300 ${hoveredFeature === feature.name ? "border-[#8E44AD]" : "border-[#F1C40F]/50"}`}
                                    >
                                      <Image
                                        src={feature.image || "/placeholder.svg"}
                                        alt={feature.name}
                                        fill
                                        className="object-cover transition-transform duration-500 group-hover:scale-110"
                                      />
                                      <div className="absolute inset-0 bg-gradient-to-t from-[#1A0933] to-transparent" />

                                      <div className="absolute bottom-0 left-0 w-full p-2 text-center">
                                        <div className="text-xs text-[#ECF0F1]">{feature.description}</div>
                                        <div className="text-sm font-bold text-[#FFF]">{feature.name}</div>
                                      </div>
                                    </div>

                                    {/* Hover effect */}
                                    <div
                                      className={'absolute -inset-px bg-[#8E44AD] opacity-0 group-hover:opacity-20 transition-opacity duration-300 pointer-events-none'}
                                    />

                                    {/* Bottom glow */}
                                    <div
                                      className={'absolute -bottom-1 left-0 w-full h-1 bg-[#8E44AD] opacity-0 group-hover:opacity-70 transition-opacity duration-300'}
                                    />
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          )}

                          {/* Video preview */}
                          

                          {/* Buttons */}
                          <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.9, duration: 0.5 }}
                            className="relative"
                          >
                            {/* biome-ignore lint/a11y/useButtonType: <explanation> */}
                           

                            {/* biome-ignore lint/a11y/useButtonType: <explanation> */}
                           

                            {/* Decorative corner */}
                            <div className="absolute -bottom-6 -left-6 w-12 h-12">
                              <div className="absolute top-0 right-0 w-6 h-1 bg-[#F1C40F]/30" />
                              <div className="absolute top-0 right-0 w-1 h-6 bg-[#F1C40F]/30" />
                            </div>
                          </motion.div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </SwiperSlide>
            ))}
          </Swiper>

          {/* Scroll indicator */}
          {activeIndex === 0 && (
            <motion.div
              className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-50 text-[#F1C40F] flex flex-col items-center"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 1,
                repeat: Number.POSITIVE_INFINITY,
                repeatType: "reverse",
              }}
            >
              <span className="text-xs mb-2 text-[#ECF0F1]">SCROLL TO EXPLORE</span>
              <ChevronDown size={32} />
            </motion.div>
          )}

          {/* Side navigation */}
          <div className="fixed right-6 top-1/2 transform -translate-y-1/2 z-50 hidden md:block">
            <div className="flex flex-col gap-6">
              {sections.map((section, index) => (
                // biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
                <div
                  key={section.id}
                  className={` rounded-full cursor-pointer transition-all duration-300 relative group ${activeIndex === index ? "bg-[#F1C40F]" : "bg-[#F1C40F]/30 hover:bg-[#F1C40F]/50"}`}
                  onClick={() =>
                    document
                      .querySelector(`.swiper-pagination-bullet:nth-child(${index + 1})`)
                      ?.dispatchEvent(new Event("click"))
                  }
                >
                  {/* Label that appears on hover */}
                  {/* <div className="absolute right-full mr-4 top-1/2 transform -translate-y-1/2 whitespace-nowrap bg-[#2C3E50] text-[#F1C40F] text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    {section.id.toUpperCase()}
                  </div> */}

                  
                  {/* {activeIndex === index && (
                    <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-px h-10 bg-gradient-to-b from-[#F1C40F] to-transparent" />
                  )} */}
                </div>
              ))}
            </div>
          </div>

        

         
        </>
      )}
    </div>
  )
}