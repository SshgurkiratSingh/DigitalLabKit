import { useState, useEffect, useCallback } from 'react';

// Assuming ICData is defined and exported from useSerialPort.ts or a common types file.
// If not, define it here:
export interface ICData {
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
  // Add other properties like truth table if they are part of the spec
}

const IC_FILES = [
  "BCDDecoderIC.json",
  "CounterIC.json",
  "ShiftRegisterIC.json",
  "arithmeticIc.json",
  "combinationalIC.json",
  "comparatorIc.json",
  "sequentialIC.json",
];

export interface UseICDataOutput {
  allICs: ICData[];
  isLoading: boolean;
  error: string | null;
  getICByPartNumber: (partNumber: string) => ICData | undefined;
  findICs: (searchText: string, category?: string) => ICData[];
}

export const useICData = (): UseICDataOutput => {
  const [allICs, setAllICs] = useState<ICData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadICData = async () => {
      setIsLoading(true);
      setError(null);
      const loadedICs: ICData[] = [];

      try {
        for (const file of IC_FILES) {
          // Assuming files are in public/files directory
          const response = await fetch(`/files/${file}`);
          if (!response.ok) {
            throw new Error(`Failed to load ${file}: ${response.statusText} (status ${response.status})`);
          }
          const data = await response.json();
          if (!data || typeof data !== "object") {
            throw new Error(`Invalid data format in ${file}. Expected an object.`);
          }

          // Extract ICs from nested structure
          // This structure is based on the example from SerialPortInterface.tsx
          Object.values(data).forEach((series: unknown) => {
            if (!series || typeof series !== "object") {
                console.warn(`Invalid series data in ${file}, skipping.`);
                return;
            }
            Object.values(series).forEach((category: unknown) => {
              if (!category || typeof category !== "object") {
                console.warn(`Invalid category data in ${file}, skipping.`);
                return;
              }
              Object.values(category).forEach((ic: unknown) => {
                // Basic validation to ensure 'ic' is an object with required properties
                if (
                  ic &&
                  typeof ic === "object" &&
                  "partNumber" in ic && typeof (ic as ICData).partNumber === "string" &&
                  "description" in ic && typeof (ic as ICData).description === "string" &&
                  "category" in ic && typeof (ic as ICData).category === "string" &&
                  "pinCount" in ic && typeof (ic as ICData).pinCount === "number" &&
                  "pinConfiguration" in ic && Array.isArray((ic as ICData).pinConfiguration)
                ) {
                  loadedICs.push(ic as ICData);
                } else {
                  // console.warn(`Skipping IC with invalid or missing properties in ${file}:`, ic);
                }
              });
            });
          });
        }
        setAllICs(loadedICs);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "An unknown error occurred while loading IC data.";
        console.error("Error loading IC data:", err);
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    // Ensure fetch runs only in the browser environment
    if (typeof window !== "undefined") {
      loadICData();
    } else {
      // If not in browser, set loading to false and potentially an error or empty state
      setIsLoading(false);
      // setError("IC data can only be loaded in the browser."); // Optional: report error for SSR/SSG
    }
  }, []); // Empty dependency array ensures this runs once on mount

  const getICByPartNumber = useCallback(
    (partNumber: string): ICData | undefined => {
      if (!partNumber) return undefined;
      return allICs.find(
        (ic) => ic.partNumber.toLowerCase() === partNumber.toLowerCase()
      );
    },
    [allICs]
  );

  const findICs = useCallback(
    (searchText: string, categoryFilter?: string): ICData[] => {
      if (!searchText && !categoryFilter) return []; // Return empty if no search/filter criteria
      if (!searchText && categoryFilter) { // Only category filter
        return allICs.filter(ic => ic.category.toLowerCase() === categoryFilter.toLowerCase());
      }

      const searchLower = searchText.toLowerCase();
      return allICs.filter((ic) => {
        const matchesSearchText =
            ic.partNumber.toLowerCase().includes(searchLower) ||
            ic.description.toLowerCase().includes(searchLower) ||
            ic.category.toLowerCase().includes(searchLower);

        const matchesCategory = categoryFilter
            ? ic.category.toLowerCase() === categoryFilter.toLowerCase()
            : true;

        return matchesSearchText && matchesCategory;
      });
    },
    [allICs]
  );

  return {
    allICs,
    isLoading,
    error,
    getICByPartNumber,
    findICs,
  };
};

// Example Usage (can be removed or commented out):
/*
function ICBrowserComponent() {
  const { allICs, isLoading, error, getICByPartNumber, findICs } = useICData();
  const [searchTerm, setSearchTerm] = useState("7400");
  const [selectedIC, setSelectedIC] = useState<ICData | undefined>(undefined);

  useEffect(() => {
    if (searchTerm) {
      const found = getICByPartNumber(searchTerm); // Example: find specific IC
      setSelectedIC(found);
    }
  }, [searchTerm, getICByPartNumber]);

  if (isLoading) return <p>Loading IC data...</p>;
  if (error) return <p>Error loading IC data: {error}</p>;

  return (
    <div>
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder="Search IC by part number or description"
      />
      {selectedIC && <div><h3>Selected IC: {selectedIC.partNumber}</h3><p>{selectedIC.description}</p></div>}

      <h2>All ICs ({allICs.length}):</h2>
      <ul>
        {findICs(searchTerm).slice(0, 10).map(ic => ( // Display top 10 matches
          <li key={ic.partNumber}>
            {ic.partNumber} - {ic.description} ({ic.category})
          </li>
        ))}
      </ul>
    </div>
  );
}
*/
