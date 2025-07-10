import { ServerCard } from "./ServerCard"

const servers = [
    {
        icon: "🧙‍♂️",
        name: "ELDRATH SHADOWWEAVER",
        tags: [{ name: "Male" }, { name: "Older" }, { name: "Deep" }],
        players: 4,
        id:"550b26ec-6e30-4089-b52c-8668ed87fbf0"
    },
    {
        icon: "🧙‍♀️",
        name: "LYRA MOONWHISPER",
        tags: [{ name: "Female" }, { name: "Young" }, { name: "Sweet" }],
        players: 6,
        id:"44b23a43-92e5-4304-9e22-a10486e8ebc7"
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