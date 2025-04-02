import { ServerCard } from "./ServerCard"

const servers = [
    {
        icon: "🧙‍♂️",
        name: "ELDRATH SHADOWWEAVER",
        tags: [{ name: "Male" }, { name: "Archmage" }, { name: "Classic Fantasy" }, { name: "Expert DM" }],
        players: 15,
        id:"44b23a43-92e5-4304-9e22-a10486e8ebc7"
    },
    {
        icon: "🧙‍♀️",
        name: "LYRA MOONWHISPER",
        tags: [{ name: "Female" }, { name: "Lorekeeper" }, { name: "Gothic Horror" }, { name: "Storyteller" }],
        players: 12,
        id:"a4b711e0-c679-4448-830e-11e86a87fa78"
    },
]

export function ServerGrid() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {servers.map((server, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
                <ServerCard key={index} {...server} />
            ))}
        </div>
    )
}