import { ChevronLeft, Play, Sliders } from "lucide-react"

export function MainContent() {
    return (
        <div className="max-w-3xl">
            <button className="flex items-center text-gray-400 mb-8 hover:text-white" type="button">
                <ChevronLeft size={20} className="mr-2" />
                <span>НАЗАД</span>
            </button>

            <h1 className="text-7xl font-bold mb-6">MAGIC</h1>

            <p className="text-gray-400 mb-6 leading-relaxed">
                На этом сервере можно почувствовать себя великим магом и волшебником благодаря уникальной подборке магических
                модов. В игре ждут огромное количество новых монстров, новое оружие и броня. Пройдя весь путь до конца, игрок
                откроет для себя невероятные артефакты.
            </p>

            <div className="flex space-x-4 mt-8">
                <button className="flex items-center bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-full" type="button">
                    <Play size={20} className="mr-2" />
                    <span>ИГРАТЬ</span>
                </button>

                <button className="flex items-center bg-[#2A2A35] hover:bg-[#3A3A45] text-white px-6 py-3 rounded-full" type="button">
                    <Sliders size={20} className="mr-2" />
                    <span>НАСТРОИТЬ</span>
                </button>
            </div>
        </div>
    )
}

