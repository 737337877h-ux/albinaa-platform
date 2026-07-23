import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

async function proxy(req: NextRequest, params: { path: string[] }) {
  const target = `${BACKEND}/${params.path.join('/')}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((v, k) => {
    if (k === 'host' || k === 'connection') return;
    headers.set(k, v);
  });

  const init: RequestInit & { duplex?: string } = {
    method: req.method,
    headers,
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = req.body;
    init.duplex = 'half';
  }

  const res = await fetch(target, init);

  const responseHeaders = new Headers();
  res.headers.forEach((v, k) => {
    if (k === 'transfer-encoding' || k === 'connection') return;
    responseHeaders.set(k, v);
  });

  return new NextResponse(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: responseHeaders,
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, await params);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, await params);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, await params);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, await params);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, await params);
}
