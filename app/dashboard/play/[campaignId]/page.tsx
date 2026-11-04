import { StoryTable } from "@/components/story/StoryTable";

export default function PlayPage({ params }: { params: { campaignId: string } }) {
  return (
    <div className="px-3 sm:px-5">
      <StoryTable campaignId={params.campaignId} />
    </div>
  );
}
