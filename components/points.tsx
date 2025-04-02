import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { motion } from "framer-motion";
import { Coins, ShoppingCart } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogTrigger } from "./ui/dialog";
import CoinPurchase from "./purchase";
interface PointsProps {
  points: number;
}

const PointsDisplay: React.FC<PointsProps> = ({ points }) => {
  return (
    <Dialog>
      <CoinPurchase />
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-sm mx-auto mt-6"
      >
        <Card className="shadow-lg rounded-lg overflow-hidden flex items-center">
          <CardHeader className="p-4">
            <CardTitle className="text-xl font-semibold">
              Current Points
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 flex items-center">
            <p className="text-2xl font-bold text-center text-yellow-500">
              {points}
            </p>
            <Coins className="mx-auto text-yellow-500" size={20} />
          </CardContent>
          <div className="p-2">
              <DialogTrigger asChild>
            <Button variant={"outline"}>
                <ShoppingCart />
            </Button>
              </DialogTrigger>
          </div>
        </Card>
      </motion.div>
    </Dialog>
  );
};

export { PointsDisplay };
