"use client";

import { useState, useEffect } from "react";

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

interface ICFile {
  [key: string]: {
    [key: string]: {
      [key: string]: ICData;
    };
  };
}

export default function ICSelector({
  onICSelect,
}: {
  onICSelect: (ic: ICData | null) => void;
}) {
  const [allICs, setAllICs] = useState<ICData[]>([]);
  const [selectedIC, setSelectedIC] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadICFiles = async () => {
      const files = [
        "BCDDecoderIC",
        "CounterIC",
        "ShiftRegisterIC",
        "arithmeticIc",
        "combinationalIC",
        "comparatorIc",
        "sequentialIC",
      ];

      const ics: ICData[] = [];
      const errors: string[] = [];

      try {
        // Load all IC files in parallel with timeout
        const responses = await Promise.all(
          files.map(file => 
            Promise.race([
              fetch(`/files/${file}.json`),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), 5000)
              )
            ]).then(response => response as Response)
          )
        );

        // Process each response
        for (let i = 0; i < responses.length; i++) {
          const response = responses[i];
          const file = files[i];

          if (!response.ok) {
            errors.push(`Failed to load ${file}.json: ${response.statusText}`);
            continue;
          }

          try {
            const data: ICFile = await response.json();
            
            if (!data || typeof data !== 'object') {
              errors.push(`Invalid data format in ${file}.json`);
              continue;
            }

            // Check for 74SeriesICs structure
            if (!data['74SeriesICs']) {
              errors.push(`Missing 74SeriesICs data in ${file}.json`);
              continue;
            }
            
            // Flatten the nested structure and extract all ICs
            const extractICs = (obj: any) => {
              if (obj && typeof obj === 'object') {
                if ('partNumber' in obj) {
                  // Only add ICs with valid pin counts (14-16)
                  if (obj.pinCount >= 14 && obj.pinCount <= 16) {
                    // Add category information to the IC object but don't show it in UI
                    const icWithCategory = {
                      ...obj,
                      category: file.replace(/IC$|Ic$/, '')
                    };
                    // Check if this IC is not already in the list (avoid duplicates)
                    if (!ics.some(existingIC => existingIC.partNumber === obj.partNumber)) {
                      ics.push(icWithCategory);
                    }
                  }
                } else {
                  Object.values(obj).forEach(value => extractICs(value));
                }
              }
            };
            
            extractICs(data);
          } catch (error) {
            errors.push(`Error parsing ${file}.json: ${error}`);
          }
        }
      } catch (err) {
        const error = err as Error;
        if (error.message === 'Timeout') {
          errors.push('Timeout while loading IC files. Please try again.');
        } else {
          errors.push(`Error loading IC files: ${error}`);
        }
      }

      if (errors.length > 0) {
        setError(errors.join('\n'));
      }

      // Sort ICs numerically by part number
      ics.sort((a, b) => {
        const aNum = parseInt(a.partNumber.match(/\d+/)?.[0] || '0');
        const bNum = parseInt(b.partNumber.match(/\d+/)?.[0] || '0');
        return aNum - bNum || a.partNumber.localeCompare(b.partNumber);
      });
      
      setAllICs(ics);
      setLoading(false);
    };

    loadICFiles();
  }, []);

  const filteredICs = allICs.filter(ic => 
    ic.partNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ic.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Search IC
        </label>
        <input
          type="text"
          className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white dark:border-gray-600"
          placeholder="Search by part number or description..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="text-center p-4 text-gray-500 dark:text-gray-400">
          Loading ICs...
        </div>
      ) : error ? (
        <div className="text-center p-4 text-red-500 dark:text-red-400">
          {error}
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Available ICs ({filteredICs.length})
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {filteredICs.map((ic) => (
              <button
                key={ic.partNumber}
                onClick={() => {
                  setSelectedIC(ic.partNumber);
                  onICSelect(ic);
                }}
                className={`p-2 text-sm text-left border rounded transition-colors flex flex-col
                  ${selectedIC === ic.partNumber
                    ? 'bg-blue-100 border-blue-500 dark:bg-blue-900 dark:border-blue-400'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 border-gray-200 dark:border-gray-700'}
                  dark:text-white`}
              >
                <div className="flex justify-between items-start">
                  <div className="font-medium text-base">{ic.partNumber}</div>
                  <div className="text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700">
                    {ic.pinCount} pins
                  </div>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                  {ic.description}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  {ic.category}
                </div>
              </button>
            ))}
          </div>
          {filteredICs.length === 0 && (
            <div className="text-center p-4 text-gray-500 dark:text-gray-400">
              No ICs found matching your search
            </div>
          )}
        </div>
      )}
    </div>
  );
}