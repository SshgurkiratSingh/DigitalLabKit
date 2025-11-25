import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_API_URL || "http://localhost:3001";

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const path = params.path.join("/");
    const searchParams = request.nextUrl.searchParams;
    
    const url = new URL(`${BACKEND_URL}/${path}`);
    searchParams.forEach((value, key) => {
      url.searchParams.append(key, value);
    });

    console.log(`[Proxy] GET ${url.toString()}`);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    return NextResponse.json(data, {
      status: response.status,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[Proxy] GET error:", error);
    return NextResponse.json(
      { error: "Proxy request failed", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const path = params.path.join("/");
    const body = await request.json();

    const url = `${BACKEND_URL}/${path}`;
    console.log(`[Proxy] POST ${url}`, body);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    return NextResponse.json(data, {
      status: response.status,
    });
  } catch (error) {
    console.error("[Proxy] POST error:", error);
    return NextResponse.json(
      { error: "Proxy request failed", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
