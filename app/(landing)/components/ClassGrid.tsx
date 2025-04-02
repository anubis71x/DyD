"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Image from "next/image"

const classes = [
  {
    id: 1,
    title: "Fighter",
    description: "Masters of martial combat, skilled with a variety of weapons and armor.",
    imageUrl: "",
    category: "Martial",
  },
  {
    id: 2,
    title: "Wizard",
    description: "Scholarly magic-users capable of manipulating the structures of reality.",
    imageUrl: "",
    category: "Spellcaster",
  },
  {
    id: 3,
    title: "Rogue",
    description: "Skillful adventurers adept at stealth and solving problems.",
    imageUrl: "",
    category: "Skillful",
  },
  {
    id: 4,
    title: "Cleric",
    description: "Priestly champions who wield divine magic in service of a higher power.",
    imageUrl: "",
    category: "Divine",
  },
  {
    id: 5,
    title: "Ranger",
    description: "Warriors of the wilderness, skilled in tracking and hunting.",
    imageUrl: "",
    category: "Hybrid",
  },
  {
    id: 6,
    title: "Paladin",
    description: "Holy warriors bound to a sacred oath, combining martial and divine power.",
    imageUrl: "",
    category: "Hybrid",
  },
]

const categories = ["All", ...new Set(classes.map((c) => c.category))]

export default function ClassGrid() {
  const [filter, setFilter] = useState("All")

  const filteredClasses = filter === "All" ? classes : classes.filter((c) => c.category === filter)

  return (
    <section className="py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">Choose Your Class</h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Explore the diverse character classes available in Dungeons & Dragons.
          </p>
        </motion.div>

        <div className="flex justify-center space-x-4 mb-8">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setFilter(category)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                filter === category
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <AnimatePresence>
            {filteredClasses.map((c) => (
              <motion.div
                key={c.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="bg-background rounded-3xl shadow-lg overflow-hidden hover-lift transition-all duration-300 ease-in-out border-2 border-transparent hover:border-primary/10"
              >
                <div className="relative h-64 overflow-hidden">
                  <Image
                    src={c.imageUrl}
                    alt={c.title}
                    layout="fill"
                    objectFit="cover"
                    className="transition-transform duration-300 ease-in-out group-hover:scale-105"
                  />
                  <motion.div
                    className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center opacity-0 transition-opacity duration-300"
                    whileHover={{ opacity: 1 }}
                  >
                    <p className="text-white text-center px-4">{c.description}</p>
                  </motion.div>
                </div>
                <div className="p-6">
                  <div className="text-sm font-medium text-primary mb-1">{c.category}</div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">{c.title}</h3>
                  <a href="#learn-more" className="text-primary hover:underline inline-flex items-center">
                    Learn More
                    <svg
                      className="w-4 h-4 ml-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </a>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  )
}

