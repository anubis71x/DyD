import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { connectToDB } from "@/lib/mongoDB";
import User from "@/lib/models/User";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-02-24.acacia",
});

export async function POST(req: Request) {
  const { amount, currency } = await req.json();
  const { userId } = auth();

  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  try {
    await connectToDB();
    const pointsToAdd = (amount / 20) * 1000;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: currency,
            product_data: {
              name: "Compra de Coins",
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${req.headers.get(
        "origin"
      )}/dashboard/purchase?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get(
        "origin"
      )}/dashboard/narrator?canceled=true`,
    });

    await User.findOneAndUpdate(
      { clerkId: userId },
      { $inc: { availablePoints: pointsToAdd } },
      { new: true, upsert: true }
    );

    return NextResponse.json({ id: session.id});
  } catch (err: any) {
    console.log("[purchase_POST] Error:", err);
    return NextResponse.json({ statusCode: 500, message: err.message });
  }
}
