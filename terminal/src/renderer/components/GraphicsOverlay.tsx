import React, { useRef, useEffect, useState, useCallback } from 'react';

interface GraphicsOverlayProps {
  sessionId: string;
  terminalRef: React.RefObject<HTMLDivElement>;
}

interface GraphicImage {
  id: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  sessionId: string;
}

function sixelToDataUrl(data: number[], palette: number[], width: number, height: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(width, height);

  // Apply palette to pixel data
  for (let i = 0; i < data.length; i++) {
    const colorIndex = data[i];
    const color = palette[colorIndex] || 0;
    const r = (color >> 16) & 0xFF;
    const g = (color >> 8) & 0xFF;
    const b = color & 0xFF;
    const a = 255;

    imageData.data[i * 4] = r;
    imageData.data[i * 4 + 1] = g;
    imageData.data[i * 4 + 2] = b;
    imageData.data[i * 4 + 3] = a;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

export function GraphicsOverlay({ sessionId, terminalRef }: GraphicsOverlayProps) {
  const [images, setImages] = useState<GraphicImage[]>([]);
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleSixelImage = useCallback((event: { sessionId: string; data: number[]; palette: number[]; width: number; height: number }) => {
    if (event.sessionId !== sessionId) return;

    try {
      const dataUrl = sixelToDataUrl(event.data, event.palette, event.width, event.height);
      
      setImages(prev => [...prev, {
        id: `sixel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        src: dataUrl,
        x: 0,
        y: 0,
        width: event.width,
        height: event.height,
        zIndex: 0,
        sessionId,
      }]);
    } catch (error) {
      console.error('Failed to render sixel image:', error);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!window.terminalAPI?.graphics) return;

    const unsubKitty = window.terminalAPI.graphics.onKittyImage((event) => {
      if (event.sessionId !== sessionId) return;
      
      const { id, data, width, height, cells, pixels, placement, zIndex } = event;
      
      // Calculate position
      let x = 0, y = 0;
      if (placement) {
        x = placement.x;
        y = placement.y;
      }

      // Calculate size
      let w = width || 200;
      let h = height || 200;
      
      if (cells) {
        // Size in cells - would need font metrics
        const charWidth = 8; // approximate
        const charHeight = 16;
        w = cells.w * charWidth;
        h = cells.h * charHeight;
      } else if (pixels) {
        w = pixels.w;
        h = pixels.h;
      }

      setImages(prev => {
        const existing = prev.findIndex(img => img.id === `kitty-${id}`);
        const newImg: GraphicImage = {
          id: `kitty-${id}`,
          src: data,
          x,
          y,
          width: w,
          height: h,
          zIndex: zIndex || 0,
          sessionId,
        };
        
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = newImg;
          return updated;
        }
        return [...prev, newImg];
      });
    });

    const unsubSixel = window.terminalAPI.graphics.onSixelImage(handleSixelImage);

    const unsubIterm2 = window.terminalAPI.graphics.onIterm2Image((event) => {
      if (event.sessionId !== sessionId) return;
      
      setImages(prev => [...prev, {
        id: `iterm2-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        src: event.data,
        x: 0,
        y: 0,
        width: event.width,
        height: event.height,
        zIndex: 0,
        sessionId,
      }]);
    });

    return () => {
      unsubKitty();
      unsubSixel();
      unsubIterm2();
      // Clean up images for this session
      setImages(prev => prev.filter(img => img.sessionId !== sessionId));
    };
  }, [sessionId, handleSixelImage]);

  // Sync overlay position with terminal
  useEffect(() => {
    const terminal = terminalRef.current;
    const overlay = overlayRef.current;
    if (!terminal || !overlay) return;

    const updatePosition = () => {
      const rect = terminal.getBoundingClientRect();
      overlay.style.left = `${rect.left}px`;
      overlay.style.top = `${rect.top}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
    };

    updatePosition();
    const ro = new ResizeObserver(updatePosition);
    ro.observe(terminal);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [terminalRef]);

  // Clean up old images periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setImages(prev => {
        // Keep only images for current session
        return prev.filter(img => img.sessionId === sessionId);
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [sessionId]);

  if (images.length === 0) return null;

  return (
    <div
      ref={overlayRef}
      className="graphics-overlay"
      style={{
        position: 'fixed',
        pointerEvents: 'none',
        zIndex: 100,
        overflow: 'hidden',
        contain: 'layout style paint',
      }}
      aria-hidden="true"
    >
      {images.map(img => (
        <img
          key={img.id}
          src={img.src}
          alt="Terminal graphic"
          style={{
            position: 'absolute',
            left: `${img.x}px`,
            top: `${img.y}px`,
            width: `${img.width}px`,
            height: `${img.height}px`,
            zIndex: img.zIndex,
            objectFit: 'contain',
            pointerEvents: 'none',
          }}
        />
      ))}
    </div>
  );
}