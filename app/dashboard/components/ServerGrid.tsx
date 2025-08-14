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
        id:"9a4e93a6-16b1-4795-a3ce-206b4804757b"
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