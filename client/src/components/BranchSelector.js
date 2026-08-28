// client/src/components/BranchSelector.jsx

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Building2, RefreshCw } from 'lucide-react';
import { useBranch } from '../context/BranchContext';
import { useLanguage } from '../context/LanguageContext';

const BranchSelector = () => {
    const { t } = useLanguage();
    const { branches, selectedBranch, loading, isOwner, switchBranch } = useBranch();
    const [isOpen, setIsOpen] = useState(false);
    const [isSwitching, setIsSwitching] = useState(false);
    const dropdownRef = useRef(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Only show for owners/admins
    if (!isOwner || !selectedBranch || branches.length <= 1) {
        return null;
    }

    const handleBranchSelect = async (branchId) => {
        setIsOpen(false);
        if (branchId === selectedBranch.id) return;
        
        setIsSwitching(true);
        try {
            await switchBranch(branchId);
        } catch (err) {
            console.error('Switch branch error:', err);
        } finally {
            setIsSwitching(false);
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                disabled={isSwitching || loading}
                className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors duration-200 min-h-[44px] min-w-[44px]"
            >
                <Building2 size={18} className="text-gray-600 dark:text-gray-400 flex-shrink-0" />
                <span className="text-gray-900 dark:text-white font-medium text-sm truncate max-w-[120px] md:max-w-[180px]">
                    {selectedBranch.name || 'Select Branch'}
                </span>
                {isSwitching ? (
                    <RefreshCw size={16} className="text-blue-500 animate-spin flex-shrink-0" />
                ) : (
                    <ChevronDown 
                        size={16} 
                        className={`text-gray-500 dark:text-gray-400 transition-transform duration-200 flex-shrink-0 ${
                            isOpen ? 'rotate-180' : ''
                        }`} 
                    />
                )}
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden min-w-[200px]">
                    <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider px-2">
                            Switch Branch
                        </p>
                    </div>
                    <div className="max-h-64 overflow-y-auto py-1">
                        {branches.map((branch) => (
                            <button
                                key={branch.id}
                                onClick={() => handleBranchSelect(branch.id)}
                                className={`w-full px-4 py-2.5 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-150 ${
                                    selectedBranch.id === branch.id 
                                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' 
                                        : 'text-gray-700 dark:text-gray-300'
                                }`}
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <Building2 size={16} className="flex-shrink-0 text-gray-400" />
                                    <span className="text-sm font-medium truncate">{branch.name}</span>
                                </div>
                                {selectedBranch.id === branch.id && (
                                    <Check size={16} className="text-blue-600 dark:text-blue-400 flex-shrink-0 ml-2" />
                                )}
                            </button>
                        ))}
                    </div>
                    {branches.length === 0 && (
                        <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                            No branches found
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default BranchSelector;