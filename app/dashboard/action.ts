'use server';

import User from '@/lib/models/User';
import { connectToDB } from '@/lib/mongoDB';
import { auth } from '@clerk/nextjs';
import Stripe from 'stripe';

let stripeInstance: Stripe | null = null;

function getStripe() {
  if (!stripeInstance && process.env.STRIPE_SECRET_KEY) {
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-02-24.acacia',
    });
  }

  if (!stripeInstance) {
    throw new Error('Stripe API key is not configured');
  }

  return stripeInstance;
}

const PACKAGE_PRICES = {
  '1000_coins': 1000, // $10.00 in cents
  '2000_coins': 1900, // $19.00 in cents
  '5000_coins': 5500, // $55.00 in cents
};

const POINTS_PER_PACKAGE = {
  '1000_coins': 60,
  '2000_coins': 120,
  '5000_coins': 360,
};

export async function createPaymentIntent(packageId: string) {
  try {
    const amount = PACKAGE_PRICES[packageId as keyof typeof PACKAGE_PRICES];

    if (!amount) {
      throw new Error('Invalid package selected');
    }

    const stripe = getStripe();

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      metadata: {
        packageId,
      },
    });

    if (paymentIntent.client_secret) {
      const { userId } = auth();
      if (!userId) throw new Error('Unauthorized');

      await connectToDB();
      const newPoints = POINTS_PER_PACKAGE[packageId as keyof typeof POINTS_PER_PACKAGE];
      
      // Obtener los puntos actuales del usuario
      const user = await User.findOne({ userId });
      const currentPoints = user?.availablePoints || 0;
      
      // Sumar los puntos nuevos a los existentes
      const totalPoints = currentPoints + newPoints;

      await User.findOneAndUpdate(
        { userId },
        { availablePoints: totalPoints },
        { new: true, upsert: true }
      );
    }

    return { clientSecret: paymentIntent.client_secret };
  } catch (error) {
    console.error('Error creating payment intent:', error);
    throw new Error('Failed to create payment intent');
  }
}