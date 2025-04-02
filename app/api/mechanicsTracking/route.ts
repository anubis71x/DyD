import { auth } from "@clerk/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { connectToDB } from "@/lib/mongoDB";
import MechanicsTracking from "@/lib/models/MechanicsTracking";

export const POST = async (req: NextRequest) => {
  try {
    const { userId } = auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const { sessionId, systemRules, resourcesUsedGained, combatEncounters, skillChecks, customRulesApplied } = await req.json();
    if (!sessionId) return new NextResponse("Missing session ID", { status: 400 });
    
    await connectToDB();
    const newTracking = await MechanicsTracking.create({
      sessionId,
      systemRules,
      resourcesUsedGained,
      combatEncounters,
      skillChecks,
      customRulesApplied,
    });

    return NextResponse.json(newTracking, { status: 201 });
  } catch (err) {
    console.log("[mechanicsTracking_POST]", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
};

export const PUT = async (req: NextRequest) => {
  try {
    const { userId } = auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });
    
    const { id, systemRules, resourcesUsedGained, combatEncounters, skillChecks, customRulesApplied } = await req.json();
    if (!id) return new NextResponse("Missing mechanics tracking ID", { status: 400 });
    
    await connectToDB();
    const updatedMechanicsTracking = await MechanicsTracking.findOneAndUpdate(
      { _id: id },
      { systemRules, resourcesUsedGained, combatEncounters, skillChecks, customRulesApplied },
      { new: true }
    );

    return NextResponse.json(updatedMechanicsTracking, { status: 200 });
  } catch (err) {
    console.log("[mechanicstracking_PUT]", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
};

export const GET = async (req: NextRequest) => {
  try {
    const { userId } = auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const { sessionId } = await req.json();
    if (!sessionId) return new NextResponse("Missing session ID", { status: 400 });

    await connectToDB();
    const mechanics = await MechanicsTracking.find({ clerkId: userId });
    return NextResponse.json(mechanics, { status: 200 });
  } catch (err) {
    console.log("[mechanicsTracking_GET]", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
};

export const DELETE = async (req: NextRequest) => {
  try {
    const { userId } = auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const { id } = await req.json();
    if (!id) return new NextResponse("Missing mechanics ID", { status: 400 });

    await connectToDB();
    await MechanicsTracking.deleteOne({ _id: id });

    return new NextResponse("Mechanics tracking deleted", { status: 200 });
  } catch (err) {
    console.log("[mechanicsTracking_DELETE]", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
};

export const dynamic = "force-dynamic";
