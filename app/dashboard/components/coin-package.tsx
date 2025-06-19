import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Coins } from "lucide-react"

interface CoinPackageProps {
  package: {
    id: string
    amount: number
    price: number
    popular: boolean
  }
  onSelect: () => void
}

export function CoinPackage({ package: pkg, onSelect }: CoinPackageProps) {
  return (
    <Card
      className={`overflow-hidden transition-all duration-200 hover:shadow-md ${
        pkg.popular ? "border-2 border-primary ring-2 ring-primary/20" : ""
      }`}
    >
      {pkg.popular && (
        <div className="bg-primary text-primary-foreground text-xs font-medium py-1 text-center">MOST POPULAR</div>
      )}
      <CardContent className="p-6">
        <div className="flex justify-center mb-4">
          <div className="relative">
            <Coins className="h-12 w-12 text-yellow-500" />
            <div className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center">
              +
            </div>
          </div>
        </div>
        <h3 className="text-2xl font-bold text-center">{pkg.amount}</h3>
        <p className="text-center text-slate-500 text-sm mb-4">Minutes</p>
        <div className="text-center text-2xl font-bold mb-2">${pkg.price}</div>
      </CardContent>
      <CardFooter className="p-4 pt-0">
        <Button onClick={onSelect} className="w-full" variant={pkg.popular ? "default" : "outline"}>
          Select
        </Button>
      </CardFooter>
    </Card>
  )
}

