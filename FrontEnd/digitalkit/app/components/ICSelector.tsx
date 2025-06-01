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
      for (const file of files) {
        try {
          const response = await fetch(`/files/${file}.json`);
          if (!response.ok) {
            console.error(`Failed to load ${file}.json:`, response.statusText);
            continue;
          }
          const data: ICFile = await response.json();
          
          // Flatten the nested structure and extract all ICs
          const extractICs = (obj: any) => {
            if (obj && typeof obj === 'object') {
              if ('partNumber' in obj) {
                ics.push(obj);
              } else {
                Object.values(obj).forEach(value => extractICs(value));
              }
            }
          };
          
          extractICs(data);
        } catch (error) {
          console.error(`Error loading ${file}.json:`, error);
        }
      }

      // Sort ICs numerically by part number
      ics.sort((a, b) => {
        const aNum = parseInt(a.partNumber.match(/\d+/)?.[0] || '0');
        const bNum = parseInt(b.partNumber.match(/\d+/)?.[0] || '0');
        return aNum - bNum || a.partNumber.localeCompare(b.partNumber);
      });
      
      console.log('Loaded ICs:', ics);
      setAllICs(ics);
    };

    loadICFiles();
  }, []);

  const handleICChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const icName = e.target.value;
    setSelectedIC(icName);
    
    if (icName) {
      const ic = allICs.find(ic => ic.partNumber === icName);
      onICSelect(ic || null);
    } else {
      onICSelect(null);
    }
  };

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

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Available ICs
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {filteredICs.map((ic) => (
            <button
              key={ic.partNumber}
              onClick={() => {
                setSelectedIC(ic.partNumber);
                onICSelect(ic);
              }}
              className={`p-2 text-sm text-left border rounded transition-colors
                ${selectedIC === ic.partNumber
                  ? 'bg-blue-100 border-blue-500 dark:bg-blue-900 dark:border-blue-400'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800 border-gray-200 dark:border-gray-700'}
                dark:text-white`}
            >
              <div className="font-medium">{ic.partNumber}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400 truncate">
                {ic.description}
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
    </div>
  );
}