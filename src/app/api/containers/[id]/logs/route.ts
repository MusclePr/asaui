import { NextRequest } from 'next/server';
import { getContainerLogsStream } from '@/lib/docker';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const containerId = id;

  try {
    const logStream = await getContainerLogsStream(containerId).catch(err => {
      if (err.statusCode === 404) {
        throw new Error('CONTAINER_NOT_FOUND');
      }
      throw err;
    }) as any;

    const responseStream = new ReadableStream({
      async start(controller) {
        logStream.on('data', (chunk: Buffer) => {
          // Docker logs can have a 8-byte header if TTY is false (multiplexed)
          // [0] = stream type (1 for stdout, 2 for stderr)
          // [1, 2, 3] = reserved
          // [4, 5, 6, 7] = payload size
          // But since we expect Tty: true, we can just send it.
          // To be safe, we check if the first byte is 1 or 2 and the rest of the header seems valid.
          // However, for simplicity and since the user has tty: true, we'll treat it as raw text.
          
          let text = chunk.toString('utf-8');
          
          // Even with TTY: true, sometimes Dockerode might return multiplexed if not careful.
          // Simple demux check:
          if (chunk.length >= 8 && (chunk[0] === 1 || chunk[0] === 2) && chunk[1] === 0 && chunk[2] === 0 && chunk[3] === 0) {
            // This looks like a multiplexed header
            text = chunk.subarray(8).toString('utf-8');
          }

          controller.enqueue(`data: ${JSON.stringify({ text })}\n\n`);
        });

        logStream.on('end', () => {
          controller.close();
        });

        logStream.on('error', (err: any) => {
          controller.error(err);
        });

        // Handle case where client disconnects
        request.signal.addEventListener('abort', () => {
          if (logStream && typeof logStream.destroy === 'function') {
            logStream.destroy();
          }
          controller.close();
        });
      },
    });

    return new Response(responseStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    if (error.message === 'CONTAINER_NOT_FOUND') {
      return new Response(JSON.stringify({ error: 'Container not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    console.error('Error streaming logs:', error);
    return new Response(JSON.stringify({ error: 'Failed to stream logs' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
