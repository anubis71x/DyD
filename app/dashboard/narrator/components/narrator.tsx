"use client";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { LucideMoreVertical, Play, Star, Swords } from "lucide-react";
import { useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery } from "@tanstack/react-query";
import { PointsDisplay } from "@/components/points";
import axios from "axios";
import { useRouter } from "next/navigation";
import useStore from "@/hooks/use-store";
import toast from "react-hot-toast";
export default function NarratorList() {
  const { setNarrator } = useStore();
  const router = useRouter();
  const [selectedNarrator, setSelectedNarrator] = useState<number | null>(null);
  const { data } = useQuery({
    queryKey: ["user"],
    queryFn: async () => {
      const response = await axios.get("/api/user");
      return response.data
    },
  });

  const narrators = [
    {
      id: 1,
      name: "Dungeon Master",
      difficulty: 3,
      description:
        "An experienced narrator specialized in dungeons and tactical encounters.",
      experience: "5 years",
      specialties: ["Combat", "Traps", "Treasures"],
      active: true,
    },
  ];
  const handleSelectNarrator = (id: number) => {
    setSelectedNarrator(id);
    const selected = narrators.find((narrator) => narrator.id === id);
    if (selected) {
      setNarrator(selected.name);
    }
    router.push('/dashboard/agent');
  }

  useEffect(() => {
    if (data?.availablePoints <= 0) {
      toast.error("You don't have enough points to hire a narrator.");
    }
  }, [
    data
  ])
  return (
    <div className="w-full mx-auto p-2 sm:p-4 space-y-4 rounded-lg">
      <div className="space-y-1  flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Narrators</h1>
          <p className="text-sm sm:text-lg text-muted-foreground">
            Select a narrator to view their details.
          </p>
        </div>
        <div>
          {data?.availablePoints >= 0 && (
            <PointsDisplay points={data.availablePoints} />
          )}
        </div>
      </div>
      <ScrollArea className="rounded-md">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-4  ">
          {narrators.slice(0, 10).map((narrator) => (
            <div
              key={narrator.id}
              className={`border rounded-lg p-3 transition-all duration-300 hover:shadow-lg ${selectedNarrator === narrator.id ? "border-primary" : ""
                }`}
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div className="flex items-center gap-4">
                  <div className="flex flex-col">
                    <span className="font-semibold text-base sm:text-lg">
                      {narrator.name}
                    </span>
                    <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                      <span>{narrator.experience}</span>
                      <div
                        className={`w-2 h-2 rounded-full ${narrator.active ? "bg-green-500" : "bg-red-500"
                          }`}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs sm:text-sm">
                    <Star className="h-3 w-3 mr-1" />
                    Level {narrator.difficulty}
                  </Badge>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 sm:h-8 sm:w-8"
                    onClick={() => handleSelectNarrator(narrator.id)}
                  >
                    <Play className="h-3 w-3 sm:h-4 sm:w-4" />
                  </Button>
                </div>
              </div>
              <Collapsible>
                <CollapsibleTrigger className="w-full">
                  <div
                    className="h-8 sm:h-10 w-full mt-2 rounded flex items-center justify-between hover:bg-accent/50 px-2"
                  >
                    <span className="text-xs sm:text-sm font-medium">
                      See More
                    </span>
                    <LucideMoreVertical className="h-3 w-3 sm:h-4 sm:w-4" />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2 space-y-2">
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {narrator.description}
                  </p>
                  <div className="flex flex-wrap gap-1 sm:gap-2">
                    {narrator.specialties.map((specialty, index) => (
                      <Badge
                        // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
                        key={index}
                        variant="outline"
                        className="text-xs sm:text-sm"
                      >
                        <Swords className="h-3 w-3 mr-1" />
                        {specialty}
                      </Badge>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
