import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { readDynamicConfig, writeDynamicConfig, broadcastDynamicConfigReload } from "@/lib/dynamicConfig";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const config = readDynamicConfig();
    return NextResponse.json(config);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const config = await req.json();
    writeDynamicConfig(config);
    
    // Broadcast reload in background (we don't wait for all to finish before returning success for file write)
    const broadcastPromise = broadcastDynamicConfigReload().catch(err => {
      console.error("Failed to broadcast dynamic config reload:", err);
    });

    return NextResponse.json({ 
      success: true, 
      message: "Dynamic settings saved. Broadcasting reload to servers..." 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
