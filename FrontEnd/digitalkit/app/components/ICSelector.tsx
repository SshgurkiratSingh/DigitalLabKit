"use client";

import { useState, useEffect } from "react";
import { ICData } from "../types"; // Import ICData

// Local ICFile interface might still be needed if its structure is specific to this component's fetching logic
interface ICFile {
  [key: string]: {
    [key: string]: {
      [key: string]: ICData;
    };
  };
}

export default function ICSelector({
  onICSelect,
  initialICs // Assuming initialICs is passed from MainInterface and is of type ICData[] from ../types
}: {
  onICSelect: (ic: ICData | null) => void;
  initialICs: ICData[]; // Add this prop to receive ICs from parent
}) {
  // const [allICs, setAllICs] = useState<ICData[]>([]); // This state will be replaced by initialICs prop
  const [selectedIC, setSelectedIC] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  // Loading and error states might still be relevant if filtering/preparing initialICs is complex,
  // but the primary data loading is now external.
  // For now, assume initialICs is ready to use.
  // const [loading, setLoading] = useState(true); // Handled by ICDataManager
  // const [error, setError] = useState<string | null>(null); // Handled by ICDataManager

  // useEffect(() => {
    // The IC loading logic is removed as ICs are passed via initialICs prop
    // If initialICs could change, might need an effect to reset selection or filter
  // }, [initialICs]);

  const filteredICs = initialICs.filter(ic =>
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