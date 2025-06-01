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
  const [icFiles, setICFiles] = useState<{ [key: string]: ICFile }>({});
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>("");
  const [selectedIC, setSelectedIC] = useState<string>("");

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

      const loadedFiles: { [key: string]: ICFile } = {};
      for (const file of files) {
        const response = await fetch(`/files/${file}.json`);
        const data = await response.json();
        loadedFiles[file] = data;
      }
      setICFiles(loadedFiles);
    };

    loadICFiles();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedFile(e.target.value);
    setSelectedCategory("");
    setSelectedSubCategory("");
    setSelectedIC("");
    onICSelect(null);
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCategory(e.target.value);
    setSelectedSubCategory("");
    setSelectedIC("");
    onICSelect(null);
  };

  const handleSubCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedSubCategory(e.target.value);
    setSelectedIC("");
    onICSelect(null);
  };

  const handleICChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const icName = e.target.value;
    setSelectedIC(icName);
    
    if (icName && selectedFile && selectedCategory && selectedSubCategory) {
      const ic = icFiles[selectedFile][selectedCategory][selectedSubCategory][icName];
      onICSelect(ic);
    } else {
      onICSelect(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          IC Family
        </label>
        <select
          className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white dark:border-gray-600"
          value={selectedFile}
          onChange={handleFileChange}
        >
          <option value="">Select IC Family</option>
          {Object.keys(icFiles).map((file) => (
            <option key={file} value={file}>
              {file.replace(/IC$|Ic$/, " IC")}
            </option>
          ))}
        </select>
      </div>

      {selectedFile && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Category
          </label>
          <select
            className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white dark:border-gray-600"
            value={selectedCategory}
            onChange={handleCategoryChange}
          >
            <option value="">Select Category</option>
            {Object.keys(icFiles[selectedFile]).map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedCategory && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Sub-Category
          </label>
          <select
            className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white dark:border-gray-600"
            value={selectedSubCategory}
            onChange={handleSubCategoryChange}
          >
            <option value="">Select Sub-Category</option>
            {Object.keys(icFiles[selectedFile][selectedCategory]).map(
              (subCategory) => (
                <option key={subCategory} value={subCategory}>
                  {subCategory}
                </option>
              )
            )}
          </select>
        </div>
      )}

      {selectedSubCategory && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            IC
          </label>
          <select
            className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white dark:border-gray-600"
            value={selectedIC}
            onChange={handleICChange}
          >
            <option value="">Select IC</option>
            {Object.keys(
              icFiles[selectedFile][selectedCategory][selectedSubCategory]
            ).map((ic) => (
              <option key={ic} value={ic}>
                {ic} -{" "}
                {
                  icFiles[selectedFile][selectedCategory][selectedSubCategory][ic]
                    .description
                }
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}