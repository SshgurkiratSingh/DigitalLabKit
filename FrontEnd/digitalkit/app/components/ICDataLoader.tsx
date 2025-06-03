"use client";

import { useState, useEffect } from 'react';

interface ICData {
  partNumber: string;
  description: string;
  category: string;
  pinCount: number;
  pinConfiguration: Array<{
    pin: number;
    name: string;
    type: string;
    function: string;
  }>;
}

interface ICDataLoaderProps {
  onICsLoaded: (ics: ICData[]) => void;
  onError: (error: string) => void;
}

export default function ICDataLoader({ onICsLoaded, onError }: ICDataLoaderProps) {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadICData = async () => {
      try {
        const icFiles = [
          'BCDDecoderIC.json',
          'CounterIC.json',
          'ShiftRegisterIC.json',
          'arithmeticIc.json',
          'combinationalIC.json',
          'comparatorIc.json',
          'sequentialIC.json'
        ];

        const allICData: ICData[] = [];

        for (const file of icFiles) {
          const response = await fetch(`/files/${file}`);
          if (!response.ok) {
            throw new Error(`Failed to load ${file}: ${response.statusText}`);
          }
          const data = await response.json();
          if (!data || typeof data !== 'object') {
            throw new Error(`Invalid data format in ${file}`);
          }

          // Extract ICs from nested structure with improved type checking
          Object.values(data).forEach((series: any) => {
            if (!series || typeof series !== 'object') {
              console.warn('Invalid series data found, skipping...');
              return;
            }
            Object.values(series).forEach((category: any) => {
              if (!category || typeof category !== 'object') {
                console.warn('Invalid category data found, skipping...');
                return;
              }
              Object.values(category).forEach((ic: any) => {
                if (!ic || typeof ic !== 'object') {
                  console.warn('Invalid IC data found, skipping...');
                  return;
                }
                // Validate required IC properties
                if (
                  ic.partNumber && typeof ic.partNumber === 'string' &&
                  ic.description && typeof ic.description === 'string' &&
                  ic.category && typeof ic.category === 'string' &&
                  ic.pinCount && typeof ic.pinCount === 'number' &&
                  Array.isArray(ic.pinConfiguration) &&
                  ic.pinConfiguration.every((pin: any) =>
                    pin &&
                    typeof pin.pin === 'number' &&
                    typeof pin.name === 'string' &&
                    typeof pin.type === 'string' &&
                    typeof pin.function === 'string'
                  )
                ) {
                  allICData.push(ic as ICData);
                } else {
                  console.warn(`Skipping IC with invalid or missing properties: ${ic.partNumber || 'unknown'}`);
                }
              });
            });
          });
        }

        onICsLoaded(allICData);
        const categories = Array.from(new Set(allICData.map(ic => ic.category))).join(', ');
        console.log(`Successfully loaded ${allICData.length} ICs. Categories: ${categories}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        onError(`Failed to load IC data: ${errorMessage}`);
      } finally {
        setIsLoading(false);
      }
    };

    loadICData();
  }, [onICsLoaded, onError]);

  // This component doesn't render anything visible
  return null;
}