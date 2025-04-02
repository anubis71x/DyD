import { User, ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"
interface Tag {
    name: string
}

interface ServerCardProps {
    icon: string
    name: string
    tags: Tag[]
    players: number,
    id:string
}

export function ServerCard({ icon, name, tags, players,id }: ServerCardProps) {
    const router = useRouter()
    return (
        <button className="group bg-[#1A1A20] hover:bg-[#2A2A35] rounded-xl p-6 transition-all duration-200 w-full" type="button" onClick={
            () => router.push(`/dashboard/agent?${name}&i=${id}`)
        }>
            <div className="flex items-start justify-between">
                <div className="space-y-4">
                    <div className="flex items-center space-x-3">
                        <span className="text-2xl">{icon}</span>
                        <h2 className="text-xl font-bold">{name}</h2>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {tags.map((tag, index) => (
                            <span
                                // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
                                key={index}
                                className="px-3 py-1 text-xs bg-[#2A2A35] group-hover:bg-[#3A3A45] rounded-full text-gray-400"
                            >
                                {tag.name}
                            </span>
                        ))}
                    </div>
                </div>

                <ArrowRight size={24} className="text-gray-600 group-hover:text-gray-400 transition-colors duration-200" />
            </div>

            <div className="flex items-center mt-6 text-gray-400">
                <User size={16} className="mr-2" />
                <span>{players}</span>
            </div>
        </button>
    )
}

