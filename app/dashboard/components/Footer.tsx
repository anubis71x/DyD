import { FileText } from "lucide-react"

export function Footer() {
    return (
        <div className="mt-auto hidden  xl:flex justify-between items-center py-2 px-4 ">
            <button className="flex items-center bg-[#1A1A20] hover:bg-[#2A2A30] px-4 py-2 rounded-md" type="button">
                <FileText size={16} className="mr-2" />
                <span>Updates</span>
            </button>

            <div className="flex items-center space-x-6">
                <button className="text-gray-400 hover:text-white" type="button">Beta</button>
                <button className="text-gray-400 hover:text-white" type="button">0.1V</button>
            </div>
        </div>
    )
}

