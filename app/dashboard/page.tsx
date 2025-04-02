"use client"
import { Play, Sliders } from "lucide-react"
import { useRouter } from "next/navigation"

export default function DungeonMaster() {
  const router = useRouter()
  return (
    <div className="px-5 from-[#1a0f2e] to-[#2d1810] max-w-4xl">


      <h1 className="text-7xl font-bold mb-6 text-amber-500">Dungeons & Dragons</h1>

      <p className="text-gray-300 mb-6 leading-relaxed text-lg">
        Welcome, brave adventurer! You are about to embark on an epic journey where I, your virtual Dungeon Master, will guide you through mysterious lands and dangerous dungeons. With the magic of AI, we will create a unique story together where your decisions will shape the fate of this realm. You will face dragons, discover ancient treasures, and forge legendary alliances.
      </p>

      <div className="flex space-x-4 mt-8">
        <button className="flex items-center bg-amber-600 hover:bg-amber-700 text-white px-6 py-3 rounded-full" type="button" onClick={() => router.push("/dashboard/narrator")}>
          <Play size={20} className="mr-2" />
          <span>START ADVENTURE</span>
        </button>

        <button className="flex items-center bg-[#2A2A35] hover:bg-[#3A3A45] text-white px-6 py-3 rounded-full cursor-not-allowed" type="button" disabled={true}>
          <Sliders size={20} className="mr-2" />
          <span>CREATE CHARACTER</span>
        </button>
      </div>
    </div>
  )
}
