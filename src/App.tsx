import React, { useState, useEffect } from 'react';
import { Leaf, X, PieChart, List, Settings, Menu, Clock, Settings as SettingsIcon, Bug, Wifi, Battery, BatteryMedium, Lightbulb, RotateCcw, Microscope, SatelliteDish, CheckCircle2, Edit2, Camera, Save, Image as ImageIcon, Download, Database, Loader2, Copy, LogIn, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzJcenLeLaO_80BkHS_aVBtqiIUCZ3ETll0JeOoyfqy2zT-sClhoPmQTH310M0s2pHm/exec";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

function centerAspectCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number,
) {
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: 100,
      },
      aspect,
      mediaWidth,
      mediaHeight,
    ),
    mediaWidth,
    mediaHeight,
  )
}

const ImageUpload = ({ label, icon: Icon, onImageUploaded, value, type }: any) => {
  const [isDragging, setIsDragging] = useState(false);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [imgSrc, setImgSrc] = useState('');
  const imgRef = React.useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();

  const onSelectFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      setImgSrc(reader.result?.toString() || '');
      setCropModalOpen(true);
    });
    reader.readAsDataURL(file);
  };

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    if (type === 'photo') {
        setCrop(centerAspectCrop(width, height, 1));
    } else {
        setCrop(centerAspectCrop(width, height, 3)); // cover ratio 3:1 approx
    }
  };

  const handleCompleteCrop = () => {
    if (imgRef.current && crop && crop.width > 0 && crop.height > 0) {
      const image = imgRef.current;
      const canvas = document.createElement('canvas');
      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;

      // Extract pixel values from crop
      const pixelCrop = crop.unit === '%' ? {
        x: (crop.x * image.width) / 100,
        y: (crop.y * image.height) / 100,
        width: (crop.width * image.width) / 100,
        height: (crop.height * image.height) / 100,
      } : crop;

      // Real physical pixels of the selected area
      const cropWidth = Math.max(1, Math.round(pixelCrop.width * scaleX));
      const cropHeight = Math.max(1, Math.round(pixelCrop.height * scaleY));
      const sx = Math.max(0, Math.round(pixelCrop.x * scaleX));
      const sy = Math.max(0, Math.round(pixelCrop.y * scaleY));

      canvas.width = cropWidth;
      canvas.height = cropHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Draw exactly the cropped area
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(
        image,
        sx,
        sy,
        cropWidth,
        cropHeight,
        0,
        0,
        cropWidth,
        cropHeight
      );

      // Scale down if the image is extremely large, to save Firestore document size if we use base64 (which we are doing)
      // Since it's saved in Firestore as Base64, we need it to be reasonably small (under 1MB).
      const finalCanvas = document.createElement('canvas');
      const MAX_WIDTH = type === 'photo' ? 500 : 1200;
      const MAX_HEIGHT = type === 'photo' ? 500 : 400;
      
      let width = cropWidth;
      let height = cropHeight;

      if (width > MAX_WIDTH || height > MAX_HEIGHT) {
        const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      finalCanvas.width = width;
      finalCanvas.height = height;
      const finalCtx = finalCanvas.getContext('2d');
      
      if (finalCtx) {
        finalCtx.imageSmoothingQuality = 'high';
        finalCtx.drawImage(canvas, 0, 0, cropWidth, cropHeight, 0, 0, width, height);
      }

      // Convert to base64
      const dataUrl = finalCanvas.toDataURL('image/jpeg', 0.85);
      onImageUploaded(dataUrl);
      setCropModalOpen(false);
      setImgSrc('');
    } else {
      setCropModalOpen(false);
      setImgSrc('');
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <div 
        className={`relative border-2 border-dashed rounded-lg p-2 transition-colors text-center cursor-pointer overflow-hidden
          ${isDragging ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-300 dark:border-gray-700 hover:border-emerald-400 dark:hover:border-emerald-600'}
        `}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) onSelectFile(file);
        }}
        onClick={(e) => {
           // Prevent opening input if a user is dragging on crop modal or something
           const input = document.createElement('input');
           input.type = 'file';
           input.accept = 'image/*';
           input.onchange = (ev: any) => {
             const file = ev.target.files[0];
             if (file) onSelectFile(file);
           };
           input.click();
        }}
      >
        {value ? (
           <div className={`relative flex items-center justify-center ${type === 'photo' ? 'w-24 h-24 mx-auto' : 'w-full aspect-[3/1]'}`}>
              <img src={value} alt="Preview" className={`max-h-full object-cover ${type === 'photo' ? 'w-full h-full rounded-full ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-gray-900' : 'w-full h-full rounded-md shadow-sm'}`} />
              <div className={`absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center ${type === 'photo' ? 'rounded-full' : 'rounded-md'}`}>
                  <span className="text-white text-xs font-semibold">Ganti Gambar</span>
              </div>
           </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-4 text-gray-500 dark:text-gray-400">
             <Icon className="w-5 h-5 mb-2 text-gray-400" />
             <p className="text-xs font-medium">Klik atau Drag & Drop foto</p>
          </div>
        )}
      </div>

      {cropModalOpen && !!imgSrc && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-lg w-full flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
               <h3 className="font-semibold text-gray-900 dark:text-white">Potong {label}</h3>
               <button onClick={() => setCropModalOpen(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                 <X className="w-5 h-5"/>
               </button>
            </div>
            <div className="p-4 overflow-auto max-h-[60vh] flex justify-center bg-gray-900">
              <ReactCrop
                crop={crop}
                onChange={(c) => setCrop(c)}
                aspect={type === 'photo' ? 1 : 3}
                circularCrop={type === 'photo'}
              >
                <img
                  ref={imgRef}
                  alt="Crop me"
                  src={imgSrc}
                  onLoad={onImageLoad}
                  className="max-w-full"
                />
              </ReactCrop>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-end gap-3">
               <button onClick={() => setCropModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700 transition">Batal</button>
               <button onClick={handleCompleteCrop} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition">Potong & Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [isProfileOpen, setProfileOpen] = useState(false);
  const [isSheetSettingsOpen, setSheetSettingsOpen] = useState(false);
  const [sheetUrl, setSheetUrl] = useState(() => localStorage.getItem('googleSheetUrl') || '');
  const [isSyncingSheet, setIsSyncingSheet] = useState(false);
  
  const [isDemoMode, setIsDemoMode] = useState(() => localStorage.getItem('isDemoMode') !== 'false');
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => (localStorage.getItem('theme') as any) || 'system');
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      
      const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      const dayName = days[now.getDay()];
      
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      
      setDateStr(`${dayName}, ${day}/${month}/${year}`);
      setTimeStr(`${hours}:${minutes}:${seconds}`);
    };
    
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);
  
  // Auth & Profile States
  const [isLoginModalOpen, setLoginModalOpen] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginName, setLoginName] = useState('');
  const [loginPhoto, setLoginPhoto] = useState('');
  const [loginCover, setLoginCover] = useState('');
  const [loginMode, setLoginMode] = useState<'login' | 'register'>('login');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(true);

  const [userProfile, setUserProfile] = useState<{ displayName: string, email: string, photoURL: string, coverUrl: string, notificationsEnabled?: boolean, temperatureUnit?: 'C' | 'F', voltageUnit?: 'V' | 'mV' } | null>(() => {
     const saved = localStorage.getItem('userProfile');
     return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    setIsDataLoading(true);
    const timer = setTimeout(() => {
      setIsDataLoading(false);
    }, 1200); // Simulate network latency
    return () => clearTimeout(timer);
  }, [isDemoMode, userProfile]);

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhotoUrl, setEditPhotoUrl] = useState('');
  const [editCoverUrl, setEditCoverUrl] = useState('');
  const [editNotificationsEnabled, setEditNotificationsEnabled] = useState(true);
  const [editTemperatureUnit, setEditTemperatureUnit] = useState<'C' | 'F'>('C');
  const [editVoltageUnit, setEditVoltageUnit] = useState<'V' | 'mV'>('V');

  const handleSaveProfile = async () => {
    if (!userProfile) return;
    const updatedProfile = {
        ...userProfile,
        displayName: editName,
        photoURL: editPhotoUrl,
        coverUrl: editCoverUrl,
        notificationsEnabled: editNotificationsEnabled,
        temperatureUnit: editTemperatureUnit,
        voltageUnit: editVoltageUnit
    };
    setUserProfile(updatedProfile);
    localStorage.setItem('userProfile', JSON.stringify(updatedProfile));
    setIsEditingProfile(false);

    if (SCRIPT_URL) {
      try {
        await fetch(SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'updateProfile',
            email: userProfile.email,
            displayName: editName,
            photoURL: editPhotoUrl,
            coverUrl: editCoverUrl
          })
        });
      } catch (e) {
        console.error("Gagal update profile server", e);
      }
    }
  };

  const handleOpenEditProfile = () => {
    if (!userProfile) return;
    setEditName(userProfile.displayName || '');
    setEditPhotoUrl(userProfile.photoURL || '');
    setEditCoverUrl(userProfile.coverUrl || '');
    setEditNotificationsEnabled(userProfile.notificationsEnabled ?? true);
    setEditTemperatureUnit(userProfile.temperatureUnit || 'C');
    setEditVoltageUnit(userProfile.voltageUnit || 'V');
    setIsEditingProfile(true);
  };

  // Data States
  const [nodeA, setNodeA] = useState(() => isDemoMode 
    ? { uv365: 142, online: true, battery: 85, voltage: 13.6, led: true }
    : { uv365: 0, online: false, battery: 0, voltage: 0, led: false }
  );
  const [nodeB, setNodeB] = useState(() => isDemoMode 
    ? { uv395: 98, online: true, battery: 62, voltage: 13.1, led: true }
    : { uv395: 0, online: false, battery: 0, voltage: 0, led: false }
  );
  const [logs, setLogs] = useState<any[]>([]);
  const [logCurrentPage, setLogCurrentPage] = useState(1);
  const logsPerPage = 10;

  // Logs Filter State
  const [filterSource, setFilterSource] = useState('all');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  const filteredLogs = React.useMemo(() => {
      return logs.filter(log => {
          // Source filter
          if (filterSource !== 'all' && log.source !== filterSource) return false;
          
          // Date range filter
          const logDate = new Date(log.timestamp);
          // Set to beginning of the day for accurate comparison
          logDate.setHours(0, 0, 0, 0);

          if (filterStartDate) {
              const startDate = new Date(filterStartDate);
              startDate.setHours(0, 0, 0, 0);
              if (logDate < startDate) return false;
          }

          if (filterEndDate) {
              const endDate = new Date(filterEndDate);
              endDate.setHours(0, 0, 0, 0);
              if (logDate > endDate) return false;
          }

          return true;
      });
  }, [logs, filterSource, filterStartDate, filterEndDate]);

  // Reset page to 1 when filters change
  useEffect(() => {
      setLogCurrentPage(1);
  }, [filterSource, filterStartDate, filterEndDate]);

  const totalLogPages = Math.ceil(filteredLogs.length / logsPerPage);
  const paginatedLogs = filteredLogs.slice(
      (logCurrentPage - 1) * logsPerPage,
      logCurrentPage * logsPerPage
  );

  // Chart Data
  const [chartData, setChartData] = useState<any[]>([]);

  // Manual Inputs
  const [manual365, setManual365] = useState('');
  const [manual395, setManual395] = useState('');
  const [evaluation, setEvaluation] = useState<{ err365: number, err395: number } | null>(null);
  
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const prevOnlineRef = React.useRef({ A: isDemoMode ? true : false, B: isDemoMode ? true : false });

  const dataRef = React.useRef({ logs, nodeA, nodeB, chartData });
  useEffect(() => {
    dataRef.current = { logs, nodeA, nodeB, chartData };
  }, [logs, nodeA, nodeB, chartData]);

  // Auto-sync ke Google Sheets setiap 5 menit
  useEffect(() => {
    if (!userProfile || !SCRIPT_URL) return;

    const syncInterval = setInterval(async () => {
      try {
        await fetch(SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'syncData',
            logs: dataRef.current.logs,
            nodeA: dataRef.current.nodeA,
            nodeB: dataRef.current.nodeB,
            chartData: dataRef.current.chartData,
            email: userProfile.email,
            isDemoMode: isDemoMode
          })
        });
        console.log("Auto-sync success");
      } catch (e) {
        console.error("Auto-sync failed:", e);
      }
    }, 5 * 60 * 1000); // 5 menit

    return () => clearInterval(syncInterval);
  }, [userProfile, isDemoMode]);

  useEffect(() => {
    prevOnlineRef.current = { A: nodeA.online, B: nodeB.online };
  }, [nodeA.online, nodeB.online]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const applyTheme = () => {
      if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };
    applyTheme();
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
    return () => window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', applyTheme);
  }, [theme]);

  // Chart Time Range State
  const [timeRange, setTimeRange] = useState<'hari' | 'minggu' | 'bulan' | 'tahun'>('hari');
  const [timeDuration, setTimeDuration] = useState<string>('hari_ini');

  // Effect Chart Time Range State
  const [effectTimeRange, setEffectTimeRange] = useState<'hari' | 'minggu' | 'bulan' | 'tahun'>('hari');
  const [effectTimeDuration, setEffectTimeDuration] = useState<string>('hari_ini');
  const [effectViewMode, setEffectViewMode] = useState<'total' | 'rata-rata'>('total');
  const [effectChartData, setEffectChartData] = useState<{NodeA: number, NodeB: number}>({NodeA: 0, NodeB: 0});


  // Offline Simulation Initial Data
  useEffect(() => {
    if (!isDemoMode || !userProfile) {
      setLogs([]);
      setNodeA({ uv365: 0, online: false, battery: 0, voltage: 0, led: false });
      setNodeB({ uv395: 0, online: false, battery: 0, voltage: 0, led: false });
      return;
    }

    let now = Date.now();
    const mockNodeAStatus = { online: true, battery: 85, voltage: 13.6, led: true };
    const mockNodeBStatus = { online: true, battery: 62, voltage: 13.1, led: true };
    
    const initialLogs = [
      { id: 1, timestamp: now - 30000, source: 'Node A (UV 365 nm)', action: 'IR Terpicu (+1)', nodeAStatus: mockNodeAStatus, nodeBStatus: mockNodeBStatus },
      { id: 2, timestamp: now - 150000, source: 'Node B (UV 395 nm)', action: 'IR Terpicu (+1)', nodeAStatus: mockNodeAStatus, nodeBStatus: mockNodeBStatus },
      { id: 3, timestamp: now - 450000, source: 'Node A (UV 365 nm)', action: 'IR Terpicu (+1)', nodeAStatus: mockNodeAStatus, nodeBStatus: mockNodeBStatus },
      { id: 4, timestamp: now - 900000, source: 'Node A (UV 365 nm)', action: 'IR Terpicu (+1)', nodeAStatus: mockNodeAStatus, nodeBStatus: mockNodeBStatus },
      { id: 5, timestamp: now - 1200000, source: 'Node B (UV 395 nm)', action: 'IR Terpicu (+1)', nodeAStatus: mockNodeAStatus, nodeBStatus: mockNodeBStatus }
    ];
    setLogs(initialLogs);
    setNodeA({ uv365: 142, online: true, battery: 85, voltage: 13.6, led: true });
    setNodeB({ uv395: 98, online: true, battery: 62, voltage: 13.1, led: true });
  }, [isDemoMode, userProfile]);

  useEffect(() => {
    if (!isDemoMode || !userProfile) {
      setChartData([]);
      return;
    }
    let labels: string[] = [];
    let dataA: number[] = [];
    let dataB: number[] = [];

    if (timeRange === 'hari') {
        const count = timeDuration === 'hari_ini' ? 1 : timeDuration === '3_hari' ? 3 : 7;
        if (timeDuration === 'hari_ini') {
            labels = ['18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '00:00', '01:00', '02:00', '03:00', '04:00', '05:00', '06:00'];
            dataA = [2, 15, 30, 45, 25, 10, 5, 3, 2, 1, 2, 1, 1];
            dataB = [1, 10, 20, 32, 18, 8, 4, 2, 1, 1, 0, 1, 0];
        } else {
            labels = Array.from({length: count}, (_, i) => `H-${count - 1 - i}`);
            dataA = Array.from({length: labels.length}, () => Math.floor(Math.random() * 80) + 20);
            dataB = Array.from({length: labels.length}, () => Math.floor(Math.random() * 50) + 10);
        }
    } else if (timeRange === 'minggu') {
        const count = timeDuration === 'minggu_ini' ? 1 : timeDuration === '4_minggu' ? 4 : 7;
        if (timeDuration === 'minggu_ini') {
            labels = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
            dataA = [120, 150, 100, 180, 142, 130, 160];
            dataB = [80, 95, 70, 110, 98, 85, 105];
        } else {
            labels = Array.from({length: count}, (_, i) => `Minggu ke-${count - i}`);
            dataA = Array.from({length: labels.length}, () => Math.floor(Math.random() * 800) + 100);
            dataB = Array.from({length: labels.length}, () => Math.floor(Math.random() * 500) + 80);
        }
    } else if (timeRange === 'bulan') {
        const count = timeDuration === 'bulan_ini' ? 1 : timeDuration === '3_bulan' ? 3 : 6;
        if (timeDuration === 'bulan_ini') {
            labels = ['Minggu 1', 'Minggu 2', 'Minggu 3', 'Minggu 4'];
            dataA = [500, 600, 550, 620];
            dataB = [350, 400, 380, 450];
        } else {
            labels = Array.from({length: count}, (_, i) => `Bulan ke-${count - i}`);
            dataA = Array.from({length: labels.length}, () => Math.floor(Math.random() * 2500) + 500);
            dataB = Array.from({length: labels.length}, () => Math.floor(Math.random() * 1800) + 300);
        }
    } else if (timeRange === 'tahun') {
        const count = timeDuration === 'tahun_ini' ? 1 : timeDuration === '2_tahun' ? 2 : 5;
        if (timeDuration === 'tahun_ini') {
            labels = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
            dataA = [1000, 1200, 1500, 2000, 2500, 3000, 2800, 2000, 1800, 1500, 1200, 1100];
            dataB = [800, 900, 1100, 1400, 1800, 2200, 2000, 1500, 1300, 1100, 900, 850];
        } else {
            const currentYear = new Date().getFullYear();
            labels = Array.from({length: count}, (_, i) => `${currentYear - (count - 1 - i)}`);
            dataA = Array.from({length: labels.length}, () => Math.floor(Math.random() * 25000) + 5000);
            dataB = Array.from({length: labels.length}, () => Math.floor(Math.random() * 18000) + 3000);
        }
    }

    const initialChartData = labels.map((time, i) => ({
      time, NodeA: dataA[i], NodeB: dataB[i]
    }));
    setChartData(initialChartData);
  }, [isDemoMode, userProfile, timeRange, timeDuration]);

  useEffect(() => {
    if (!isDemoMode || !userProfile) {
      setEffectChartData({NodeA: 0, NodeB: 0});
      return;
    }
    
    let sumA = 0;
    let sumB = 0;
    let countData = 1;
    
    if (effectTimeRange === 'hari') {
        const count = effectTimeDuration === 'hari_ini' ? 1 : effectTimeDuration === '3_hari' ? 3 : 7;
        countData = count;
        if (effectTimeDuration === 'hari_ini') {
            sumA = 142; // Fallbacks
            sumB = 98;
        } else {
            sumA = Array.from({length: count}, () => Math.floor(Math.random() * 80) + 20).reduce((a, b) => a + b, 0);
            sumB = Array.from({length: count}, () => Math.floor(Math.random() * 50) + 10).reduce((a, b) => a + b, 0);
        }
    } else if (effectTimeRange === 'minggu') {
        const count = effectTimeDuration === 'minggu_ini' ? 1 : effectTimeDuration === '4_minggu' ? 4 : 7;
        countData = count;
        if (effectTimeDuration === 'minggu_ini') {
            sumA = [120, 150, 100, 180, 142, 130, 160].reduce((a, b) => a + b, 0);
            sumB = [80, 95, 70, 110, 98, 85, 105].reduce((a, b) => a + b, 0);
        } else {
            sumA = Array.from({length: count}, () => Math.floor(Math.random() * 800) + 100).reduce((a, b) => a + b, 0);
            sumB = Array.from({length: count}, () => Math.floor(Math.random() * 500) + 80).reduce((a, b) => a + b, 0);
        }
    } else if (effectTimeRange === 'bulan') {
        const count = effectTimeDuration === 'bulan_ini' ? 1 : effectTimeDuration === '3_bulan' ? 3 : 6;
        countData = count;
        if (effectTimeDuration === 'bulan_ini') {
            sumA = [500, 600, 550, 620].reduce((a, b) => a + b, 0);
            sumB = [350, 400, 380, 450].reduce((a, b) => a + b, 0);
        } else {
            sumA = Array.from({length: count}, () => Math.floor(Math.random() * 2500) + 500).reduce((a, b) => a + b, 0);
            sumB = Array.from({length: count}, () => Math.floor(Math.random() * 1800) + 300).reduce((a, b) => a + b, 0);
        }
    } else if (effectTimeRange === 'tahun') {
        const count = effectTimeDuration === 'tahun_ini' ? 1 : effectTimeDuration === '2_tahun' ? 2 : 5;
        countData = count;
        if (effectTimeDuration === 'tahun_ini') {
            sumA = [1000, 1200, 1500, 2000, 2500, 3000, 2800, 2000, 1800, 1500, 1200, 1100].reduce((a, b) => a + b, 0);
            sumB = [800, 900, 1100, 1400, 1800, 2200, 2000, 1500, 1300, 1100, 900, 850].reduce((a, b) => a + b, 0);
        } else {
            sumA = Array.from({length: count}, () => Math.floor(Math.random() * 25000) + 5000).reduce((a, b) => a + b, 0);
            sumB = Array.from({length: count}, () => Math.floor(Math.random() * 18000) + 3000).reduce((a, b) => a + b, 0);
        }
    }
    
    if (effectViewMode === 'rata-rata') {
        sumA = Math.round(sumA / countData);
        sumB = Math.round(sumB / countData);
    }
    
    setEffectChartData({NodeA: sumA, NodeB: sumB});
  }, [isDemoMode, userProfile, effectTimeRange, effectTimeDuration, effectViewMode]);

  const generateLogsSync = () => {
      const sources = ['Node A (UV 365 nm)', 'Node B (UV 395 nm)'];
      const source = sources[Math.floor(Math.random() * sources.length)];
      const isNodeA = source.includes('365');
      
      const newLog = {
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        timestamp: Date.now(),
        source: source,
        action: 'IR Terpicu (+1)',
        nodeAStatus: { online: nodeA.online, battery: nodeA.battery, voltage: nodeA.voltage, led: nodeA.led },
        nodeBStatus: { online: nodeB.online, battery: nodeB.battery, voltage: nodeB.voltage, led: nodeB.led }
      };
      
      setLogs(prev => [newLog, ...prev].slice(0, 15));

      if (isNodeA) {
        setNodeA(prev => ({ ...prev, uv365: prev.uv365 + 1 }));
      } else {
        setNodeB(prev => ({ ...prev, uv395: prev.uv395 + 1 }));
      }
  };

  const syncToGoogleSheet = async () => {
    setIsSyncingSheet(true);
    try {
      const dataPayload = {
        action: 'syncData',
        logs: dataRef.current.logs,
        nodeA: dataRef.current.nodeA,
        nodeB: dataRef.current.nodeB,
        chartData: dataRef.current.chartData,
        isDemoMode: isDemoMode,
        email: userProfile?.email
      };
      
      const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(dataPayload)
      });
      
      const result = await response.json();
      if (result.status === 'success') {
        // Berhasil sinkronisasi
      } else {
        throw new Error(result.message || 'Unknown error');
      }
    } catch (e: any) {
       console.error("Sync error:", e);
    } finally {
      setIsSyncingSheet(false);
    }
  };

  const validateEmail = (email: string) => {
    return String(email)
      .toLowerCase()
      .match(
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
      );
  };

  const validatePassword = (password: string) => {
    // Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character
    const re = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return re.test(password);
  };

  const getPasswordStrength = (password: string) => {
    let score = 0;
    if (!password) return 0;
    if (password.length >= 8) score += 1;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[@$!%*?&]/.test(password)) score += 1;
    return score;
  };

  const getStrengthColor = (score: number) => {
    if (score === 0) return 'bg-gray-200 dark:bg-gray-800';
    if (score === 1) return 'bg-red-500';
    if (score === 2) return 'bg-orange-500';
    if (score === 3) return 'bg-yellow-500';
    return 'bg-emerald-500';
  };
  
  const getStrengthLabel = (score: number) => {
    if (score === 0) return 'Sangat Lemah';
    if (score === 1) return 'Lemah';
    if (score === 2) return 'Sedang';
    if (score === 3) return 'Kuat';
    return 'Sangat Kuat';
  };

  const submitAuth = async () => {
    setLoginError('');
    if (!loginEmail || !loginPassword) {
       setLoginError("Mohon lengkapi email dan password!");
       return;
    }
    if (!validateEmail(loginEmail)) {
        setLoginError("Format email tidak valid atau bukan email asli!");
        return;
    }
    
    if (loginMode === 'register' && !validatePassword(loginPassword)) {
        setLoginError("Password lemah! Minimal 8 karakter, mencakup huruf besar, huruf kecil, angka, dan simbol khusus (seperti @$!%*?&).");
        return;
    }

    setIsAuthLoading(true);
    try {
      const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: loginMode,
          email: loginEmail,
          password: loginPassword,
          name: loginMode === 'register' ? loginName : undefined,
          photoURL: loginMode === 'register' ? loginPhoto : undefined,
          coverUrl: loginMode === 'register' ? loginCover : undefined,
          isDemoMode: isDemoMode
        })
      });
      const result = await response.json();
      if (result.status === 'success') {
         setLoginSuccess(true);
         setTimeout(() => {
           const profile = {
               displayName: result.data ? result.data.name || loginEmail.split('@')[0] : loginEmail.split('@')[0],
               email: loginEmail,
               photoURL: result.data ? result.data.photoURL || '' : '',
               coverUrl: result.data ? result.data.coverUrl || '' : ''
           };
           setUserProfile(profile);
           localStorage.setItem('userProfile', JSON.stringify(profile));
           setLoginModalOpen(false);
           setLoginSuccess(false);
           setLoginEmail('');
           setLoginPassword('');
           setLoginName('');
         }, 1500); // Wait 1.5s for animation
      } else {
         setLoginError(result.message || "Email atau password salah.");
      }
    } catch(e: any) {
      setLoginError("Gagal menghubungi server. Pastikan koneksi internet aktif dan Google Script URL valid.");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const calculateAccuracy = () => {
    const m365 = parseFloat(manual365);
    const m395 = parseFloat(manual395);
    if (!isNaN(m365) && !isNaN(m395)) {
      const err365 = m365 > 0 ? (Math.abs(nodeA.uv365 - m365) / m365) * 100 : (nodeA.uv365 > 0 ? 100 : 0);
      const err395 = m395 > 0 ? (Math.abs(nodeB.uv395 - m395) / m395) * 100 : (nodeB.uv395 > 0 ? 100 : 0);
      setEvaluation({ err365, err395 });
    }
  };

  const handleDownloadExcel = () => {
    // Dynamically import xlsx to keep the initial bundle small
    import('xlsx').then(XLSX => {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Logs
      const vUnit = userProfile?.voltageUnit === 'mV' ? 'mV' : 'V';
      const logData = logs.map(log => ({
        'ID Log': log.id,
        'Waktu (Lengkap)': new Date(log.timestamp).toLocaleString('id-ID', {
          year: 'numeric', month: 'long', day: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        }),
        'Waktu UNIX': log.timestamp,
        'Sumber Node': log.source,
        'Aksi Deteksi': log.action || 'IR Terpicu (+1)',
        'Node A Online': log.nodeAStatus?.online ? 'Ya' : 'Tidak',
        'Node A Baterai (%)': log.nodeAStatus?.battery || 0,
        [`Node A Tegangan (${vUnit})`]: log.nodeAStatus ? (userProfile?.voltageUnit === 'mV' ? log.nodeAStatus.voltage * 1000 : log.nodeAStatus.voltage) : 0,
        'Node A LED': log.nodeAStatus?.led ? 'Nyala' : 'Mati',
        'Node B Online': log.nodeBStatus?.online ? 'Ya' : 'Tidak',
        'Node B Baterai (%)': log.nodeBStatus?.battery || 0,
        [`Node B Tegangan (${vUnit})`]: log.nodeBStatus ? (userProfile?.voltageUnit === 'mV' ? log.nodeBStatus.voltage * 1000 : log.nodeBStatus.voltage) : 0,
        'Node B LED': log.nodeBStatus?.led ? 'Nyala' : 'Mati'
      }));
      const wsLogs = XLSX.utils.json_to_sheet(logData);
      XLSX.utils.book_append_sheet(wb, wsLogs, "Log Deteksi");

      // Sheet 2: Chart Data
      const chartDataFormatted = chartData.map(c => ({
        'Waktu': c.time,
        'Tangkapan Node A (365nm)': c.NodeA,
        'Tangkapan Node B (395nm)': c.NodeB
      }));
      const wsChart = XLSX.utils.json_to_sheet(chartDataFormatted);
      XLSX.utils.book_append_sheet(wb, wsChart, "Grafik Tangkapan");

      // Sheet 3: Sensor Status
      const nodesData = [
        {
          'Nama Node': 'Node A (UV 365nm)',
          'Total Tangkapan': nodeA.uv365,
          'Status': nodeA.online ? 'Online' : 'Offline',
          'Baterai (%)': nodeA.battery,
          [`Tegangan (${vUnit})`]: userProfile?.voltageUnit === 'mV' ? nodeA.voltage * 1000 : nodeA.voltage,
          'LED': nodeA.led ? 'Nyala' : 'Mati'
        },
        {
          'Nama Node': 'Node B (UV 395nm)',
          'Total Tangkapan': nodeB.uv395,
          'Status': nodeB.online ? 'Online' : 'Offline',
          'Baterai (%)': nodeB.battery,
          [`Tegangan (${vUnit})`]: userProfile?.voltageUnit === 'mV' ? nodeB.voltage * 1000 : nodeB.voltage,
          'LED': nodeB.led ? 'Nyala' : 'Mati'
        }
      ];
      const wsNodes = XLSX.utils.json_to_sheet(nodesData);
      XLSX.utils.book_append_sheet(wb, wsNodes, "Status Sensor");

      if (userProfile) {
         const userData = [{
             'Nama': userProfile.displayName || 'Anonim',
             'Email': userProfile.email || 'Tidak ada',
             'Status Pengguna': 'Mode Terhubung Offline',
         }];
         const wsUser = XLSX.utils.json_to_sheet(userData);
         XLSX.utils.book_append_sheet(wb, wsUser, "Data Pengguna");
      }

      // Save the file
      XLSX.writeFile(wb, `Database_Lengkap_${new Date().toISOString().slice(0, 10)}.xlsx`);
    });
  };

  return (
    <div className="relative flex h-screen overflow-hidden text-gray-800 bg-gray-50 dark:bg-gray-950 dark:text-gray-200 transition-colors duration-500 font-sans">
      
      {/* Decorative Blur Backgrounds */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] dark:opacity-[0.02]">
           <Bug className="w-[80vw] h-[80vw] text-emerald-900 dark:text-emerald-100 -rotate-12" />
        </div>
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-emerald-400/10 dark:bg-emerald-900/20 blur-[120px] mix-blend-multiply dark:mix-blend-lighten" />
        <div className="absolute top-[40%] -right-[10%] w-[40%] h-[60%] rounded-full bg-teal-400/10 dark:bg-teal-900/20 blur-[100px] mix-blend-multiply dark:mix-blend-lighten" />
        <div className="absolute -bottom-[20%] left-[20%] w-[60%] h-[50%] rounded-full bg-blue-400/10 dark:bg-blue-900/20 blur-[120px] mix-blend-multiply dark:mix-blend-lighten" />
      </div>

      {/* Main Container Wrapper */}
      <div className="flex h-screen w-full relative z-10">

      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden" onClick={() => setSidebarOpen(false)}></div>
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 w-64 bg-emerald-900 text-white flex flex-col z-30 transform transition-transform duration-300 shadow-xl md:shadow-none md:relative md:translate-x-0",
        !isSidebarOpen && "-translate-x-full"
      )}>
        <div className="p-6 flex items-center justify-between border-b border-emerald-800">
          <div className="flex items-center gap-3">
             <Leaf className="text-emerald-400 w-6 h-6" />
             <div>
               <h1 className="text-lg font-bold leading-tight">Light Trap IoT</h1>
               <p className="text-xs text-emerald-300">Monitoring UPDKS</p>
             </div>
          </div>
          <button className="md:hidden text-emerald-300 hover:text-white" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <div className={cn("mb-4 flex items-center justify-between px-3 py-2 rounded-lg border", isDemoMode ? "bg-amber-900/40 border-amber-500/30 text-amber-300" : "bg-emerald-800/60 border-emerald-500/30 text-emerald-300")}>
             <span className="text-xs font-semibold uppercase tracking-wider">Status Mode</span>
             <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full border", isDemoMode ? "bg-amber-400 text-amber-900 border-amber-400" : "bg-emerald-400 text-emerald-900 border-emerald-400")}>
                {isDemoMode ? 'DEMO' : 'ASLI'}
             </span>
          </div>

          <button onClick={() => { document.getElementById('dashboard-top')?.scrollIntoView({ behavior: 'smooth' }); setSidebarOpen(false); }} className="w-full flex items-center gap-3 bg-emerald-800 text-white p-3 rounded-lg font-medium transition text-left">
            <PieChart className="w-5 h-5"/> Dashboard
          </button>
        </nav>
        <div className="p-4 border-t border-emerald-800 w-full block">
          {userProfile ? (
            <div className="flex items-center justify-between gap-3 w-full">
              <div className="flex items-center gap-3 w-full cursor-pointer hover:bg-emerald-800 p-2 rounded-lg transition-colors" onClick={() => { setProfileOpen(true); setSidebarOpen(false); }}>
                <img src={userProfile.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(userProfile.displayName || 'User')}`} alt="avatar" className="w-10 h-10 rounded-full shrink-0" />
                <div className="overflow-hidden flex-1">
                  <p className="text-sm font-semibold truncate w-full">{userProfile.displayName || "User"}</p>
                  <p className="text-xs text-emerald-300 truncate w-full">{userProfile.email || "user@example.com"}</p>
                </div>
              </div>
            </div>
          ) : (
            <button onClick={() => { setLoginModalOpen(true); setSidebarOpen(false); }} className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-600 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2 shadow-sm border border-emerald-600">
              <div className="bg-white p-1 rounded-full"><LogIn className="w-4 h-4 text-emerald-600" /></div>
              Login Akun
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
         <header className="bg-white dark:bg-gray-800 h-auto min-h-[4rem] py-3 lg:py-0 lg:h-16 flex flex-col lg:flex-row lg:items-center justify-between px-4 lg:px-8 border-b border-gray-200 dark:border-gray-700 shrink-0 z-10 shadow-sm transition-colors duration-300 gap-3 lg:gap-0">
            <div className="flex items-center justify-between w-full lg:w-auto">
               <div className="flex items-center gap-3 sm:gap-4">
                  <button className="lg:hidden text-gray-500 hover:text-gray-700 dark:hover:text-white focus:outline-none" onClick={() => setSidebarOpen(true)}>
                     <Menu className="w-6 h-6"/>
                  </button>
                  <h2 className="text-base sm:text-lg md:text-xl font-semibold text-gray-800 dark:text-white truncate flex items-center gap-2">
                     Ringkasan Pengamatan
                     <span className={cn("text-[10px] sm:text-xs px-2 py-0.5 rounded-full border hidden sm:inline-block", isDemoMode ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800" : "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800")}>
                         {isDemoMode ? 'Mode Demo' : 'Mode Asli'}
                     </span>
                  </h2>
               </div>
               <button 
                  onClick={() => setSettingsOpen(true)}
                  className="lg:hidden w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors flex items-center justify-center shadow-sm border border-gray-200 dark:border-gray-700 focus:outline-none shrink-0"
                >
                    <SettingsIcon className="w-4 h-4"/>
                </button>
            </div>
            <div className="flex items-center justify-between lg:justify-end gap-2 md:gap-4 w-full lg:w-auto">
                {!isOnline && (
                  <div className="text-[10px] sm:text-sm font-semibold px-2 sm:px-3 py-1 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800 flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0">
                     <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span> Offline Mode
                  </div>
                )}
                <div className="flex bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm rounded-lg items-center px-2.5 sm:px-3.5 py-1.5 gap-1.5 sm:gap-2 transition-colors w-full lg:w-auto justify-center lg:justify-start">
                    <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 animate-[spin_4s_linear_infinite] shrink-0" />
                    <div className="flex flex-row items-center justify-center gap-1.5 sm:gap-2 text-gray-700 dark:text-gray-300 font-mono tabular-nums tracking-tight leading-tight truncate">
                        <span className="text-[10px] sm:text-sm font-medium text-gray-500 dark:text-gray-400 truncate">{dateStr || '--/--/----'}</span>
                        <span className="inline text-gray-300 dark:text-gray-600">•</span>
                        <span className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white shrink-0">{timeStr || '--:--:--'}</span>
                    </div>
                </div>
                <button 
                  onClick={() => setSettingsOpen(true)}
                  className="hidden lg:flex w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors items-center justify-center shadow-sm border border-gray-200 dark:border-gray-700 focus:outline-none shrink-0"
                >
                    <SettingsIcon className="w-5 h-5"/>
                </button>
            </div>
         </header>

         <div className="flex-1 overflow-y-auto p-4 lg:p-8" id="dashboard-top">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6 mb-6">
                
                {/* Node A */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border-l-4 border-l-purple-500 shadow-sm relative overflow-hidden group">
                   <Bug className="absolute -bottom-4 -right-2 w-24 h-24 text-purple-100 dark:text-purple-900/20 rotate-12 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-12 z-0" />
                   <div className="relative z-10 flex justify-between items-start">
                       <div>
                          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-1">Total Tangkapan Sensor</p>
                          <h3 className="text-2xl font-bold text-gray-800 dark:text-white">Node A <span className="text-purple-600 dark:text-purple-400 text-sm">(365 nm)</span></h3>
                       </div>
                       <div className="flex items-center gap-2">
                           {isDemoMode && (
                               <button 
                                   onClick={() => setNodeA(prev => ({...prev, uv365: Math.max(0, prev.uv365 - 1)}))}
                                   className="w-12 h-12 rounded-full flex items-center justify-center text-red-600 dark:text-red-400 bg-red-200 dark:bg-red-900/60 transition-transform cursor-pointer hover:scale-110 active:scale-95 shadow-sm"
                                   title="Kurangi tangkapan (-1)"
                               >
                                  <Bug className="w-6 h-6"/>
                               </button>
                           )}
                           <button 
                               onClick={() => isDemoMode && setNodeA(prev => ({...prev, uv365: prev.uv365 + 1}))}
                               className={cn(
                                   "w-12 h-12 rounded-full flex items-center justify-center text-purple-600 dark:text-purple-400 transition-transform shadow-sm",
                                   isDemoMode ? "bg-purple-200 dark:bg-purple-900/60 cursor-pointer hover:scale-110 active:scale-95" : "bg-purple-100 dark:bg-purple-900/40"
                               )}
                               title={isDemoMode ? "Tambah tangkapan (+1)" : ""}
                           >
                              <Bug className="w-6 h-6"/>
                           </button>
                       </div>
                   </div>
                   <div className="relative z-10 mt-4 flex items-end gap-2">
                       <span className="text-4xl font-bold text-gray-900 dark:text-white transition-all duration-300">{nodeA.uv365}</span>
                       <span className="text-sm text-gray-500 dark:text-gray-400 mb-1">ngengat</span>
                   </div>
                </div>

                {/* Node B */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border-l-4 border-l-blue-500 shadow-sm relative overflow-hidden group">
                   <Bug className="absolute -bottom-4 -right-2 w-24 h-24 text-blue-100 dark:text-blue-900/20 rotate-12 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-12 z-0" />
                   <div className="relative z-10 flex justify-between items-start">
                       <div>
                          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-1">Total Tangkapan Sensor</p>
                          <h3 className="text-2xl font-bold text-gray-800 dark:text-white">Node B <span className="text-blue-600 dark:text-blue-400 text-sm">(395 nm)</span></h3>
                       </div>
                       <div className="flex items-center gap-2">
                           {isDemoMode && (
                               <button 
                                   onClick={() => setNodeB(prev => ({...prev, uv395: Math.max(0, prev.uv395 - 1)}))}
                                   className="w-12 h-12 rounded-full flex items-center justify-center text-red-600 dark:text-red-400 bg-red-200 dark:bg-red-900/60 transition-transform cursor-pointer hover:scale-110 active:scale-95 shadow-sm"
                                   title="Kurangi tangkapan (-1)"
                               >
                                  <Bug className="w-6 h-6"/>
                               </button>
                           )}
                           <button 
                               onClick={() => isDemoMode && setNodeB(prev => ({...prev, uv395: prev.uv395 + 1}))}
                               className={cn(
                                   "w-12 h-12 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 transition-transform shadow-sm",
                                   isDemoMode ? "bg-blue-200 dark:bg-blue-900/60 cursor-pointer hover:scale-110 active:scale-95" : "bg-blue-100 dark:bg-blue-900/40"
                               )}
                               title={isDemoMode ? "Tambah tangkapan (+1)" : ""}
                           >
                              <Bug className="w-6 h-6"/>
                           </button>
                       </div>
                   </div>
                   <div className="relative z-10 mt-4 flex items-end gap-2">
                       <span className="text-4xl font-bold text-gray-900 dark:text-white transition-all duration-300">{nodeB.uv395}</span>
                       <span className="text-sm text-gray-500 dark:text-gray-400 mb-1">ngengat</span>
                   </div>
                </div>

                {/* Node A Status */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
                   <SatelliteDish className="absolute -bottom-4 right-0 w-24 h-24 text-gray-100 dark:text-gray-700/30 rotate-[-15deg] transition-transform duration-500 group-hover:scale-110 group-hover:-translate-x-2 z-0" />
                   <div className="relative z-10 flex justify-between items-center mb-4">
                       <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Status Node A (365nm)</h3>
                       <span className={cn("px-2 py-1 text-xs font-bold rounded-full border flex items-center gap-1", nodeA.online ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800" : "bg-gray-100 text-gray-500")}>
                           <Wifi className="w-3 h-3"/> {nodeA.online ? 'Online' : 'Offline'}
                       </span>
                   </div>
                   <div className="relative z-10 space-y-3">
                       <div>
                           <div className="flex justify-between text-xs mb-1">
                               <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1"><Battery className="w-3 h-3"/> Baterai</span>
                               <span className="font-bold text-gray-700 dark:text-gray-300">{nodeA.battery}% ({userProfile?.voltageUnit === 'mV' ? nodeA.voltage * 1000 + 'mV' : nodeA.voltage + 'V'})</span>
                           </div>
                           <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                               <div className="bg-green-500 h-2 rounded-full transition-all duration-700" style={{ width: `${nodeA.battery}%` }}></div>
                           </div>
                       </div>
                       <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-500 dark:text-gray-400">Status LED (Relay)</span>
                          <span className={cn("font-bold flex items-center gap-1", nodeA.led ? "text-yellow-600 dark:text-yellow-400" : "text-gray-400")}>
                              <Lightbulb className="w-4 h-4"/> {nodeA.led ? 'Menyala' : 'Mati'}
                          </span>
                       </div>
                   </div>
                </div>

                {/* Node B Status */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
                   <SatelliteDish className="absolute -bottom-4 right-0 w-24 h-24 text-gray-100 dark:text-gray-700/30 rotate-[-15deg] transition-transform duration-500 group-hover:scale-110 group-hover:-translate-x-2 z-0" />
                   <div className="relative z-10 flex justify-between items-center mb-4">
                       <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Status Node B (395nm)</h3>
                       <span className={cn("px-2 py-1 text-xs font-bold rounded-full border flex items-center gap-1", nodeB.online ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800" : "bg-gray-100 text-gray-500")}>
                           <Wifi className="w-3 h-3"/> {nodeB.online ? 'Online' : 'Offline'}
                       </span>
                   </div>
                   <div className="relative z-10 space-y-3">
                       <div>
                           <div className="flex justify-between text-xs mb-1">
                               <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1"><BatteryMedium className="w-3 h-3"/> Baterai</span>
                               <span className="font-bold text-gray-700 dark:text-gray-300">{nodeB.battery}% ({userProfile?.voltageUnit === 'mV' ? nodeB.voltage * 1000 + 'mV' : nodeB.voltage + 'V'})</span>
                           </div>
                           <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                               <div className="bg-yellow-500 h-2 rounded-full transition-all duration-700" style={{ width: `${nodeB.battery}%` }}></div>
                           </div>
                       </div>
                       <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-500 dark:text-gray-400">Status LED (Relay)</span>
                          <span className={cn("font-bold flex items-center gap-1", nodeB.led ? "text-yellow-600 dark:text-yellow-400" : "text-gray-400")}>
                              <Lightbulb className="w-4 h-4"/> {nodeB.led ? 'Menyala' : 'Mati'}
                          </span>
                       </div>
                   </div>
                </div>
            </div>

            {isDemoMode && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 mb-6">
                    {/* Arrival Chart */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 md:p-5 lg:col-span-2 shadow-sm relative overflow-hidden group">
                       <Bug className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 text-gray-50 dark:text-gray-900/10 rotate-12 transition-transform duration-[2s] group-hover:scale-110 group-hover:-rotate-12 z-0 pointer-events-none" />
                       <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
                           <h3 className="text-base md:text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                               <PieChart className="w-5 h-5 text-emerald-500" />
                               Fluktuasi Waktu Kedatangan
                           </h3>
                           <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                               {isDemoMode && (
                                   <select
                                       value={timeDuration}
                                       onChange={(e) => setTimeDuration(e.target.value)}
                                       className="w-full sm:w-auto bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-xs rounded-lg focus:ring-emerald-500 focus:border-emerald-500 p-1.5 outline-none"
                                   >
                                       {timeRange === 'hari' && <>
                                           <option value="hari_ini">Hari Ini</option>
                                           <option value="3_hari">3 Hari Terakhir</option>
                                           <option value="7_hari">7 Hari Terakhir</option>
                                       </>}
                                       {timeRange === 'minggu' && <>
                                           <option value="minggu_ini">Minggu Ini</option>
                                           <option value="4_minggu">4 Minggu Terakhir</option>
                                           <option value="7_minggu">7 Minggu Terakhir</option>
                                       </>}
                                       {timeRange === 'bulan' && <>
                                           <option value="bulan_ini">Bulan Ini</option>
                                           <option value="3_bulan">3 Bulan Terakhir</option>
                                           <option value="6_bulan">6 Bulan Terakhir</option>
                                       </>}
                                       {timeRange === 'tahun' && <>
                                           <option value="tahun_ini">Tahun Ini</option>
                                           <option value="2_tahun">1-2 Tahun Terakhir</option>
                                           <option value="5_tahun">5 Tahun Terakhir</option>
                                       </>}
                                   </select>
                               )}
                               <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1 border border-gray-200 dark:border-gray-700 w-full sm:w-auto">
                                   {(['hari', 'minggu', 'bulan', 'tahun'] as const).map(t => (
                                       <button 
                                           key={t}
                                           onClick={() => {
                                               setTimeRange(t);
                                               setTimeDuration(t + '_ini');
                                           }}
                                           className={cn(
                                               "px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors flex-1 text-center",
                                               timeRange === t ? "bg-white dark:bg-gray-600 text-emerald-600 dark:text-emerald-400 shadow-sm" : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                                           )}
                                       >
                                           {t}
                                       </button>
                                   ))}
                               </div>
                           </div>
                       </div>
                       <div className="relative w-full h-64 md:h-72 min-h-[200px]">
                          {isDataLoading ? (
                             <div className="w-full h-full flex flex-col gap-4">
                                <div className="h-full w-full bg-gray-100 dark:bg-gray-700/50 rounded-lg animate-pulse backdrop-blur-sm relative overflow-hidden">
                                   <div className="absolute top-1/2 left-0 w-full border-t-2 border-dashed border-gray-300 dark:border-gray-600 top-1/2 -mt-4 opacity-50"></div>
                                   <div className="absolute top-0 bottom-0 left-[20%] w-px bg-gray-300 dark:bg-gray-600 opacity-50"></div>
                                   <div className="absolute top-0 bottom-0 left-[50%] w-px bg-gray-300 dark:bg-gray-600 opacity-50"></div>
                                   <div className="absolute top-0 bottom-0 left-[80%] w-px bg-gray-300 dark:bg-gray-600 opacity-50"></div>
                                </div>
                             </div>
                          ) : chartData.length === 0 ? (
                             <div className="w-full h-full flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                                <Leaf className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
                                <p className="text-gray-500 dark:text-gray-400 font-medium text-sm">Belum ada data tangkapan ngengat</p>
                                <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">Data akan muncul di sini setelah sensor mulai mendeteksi.</p>
                             </div>
                          ) : (
                          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                             <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                               <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                               <XAxis dataKey="time" stroke="#9ca3af" fontSize={12} />
                               <YAxis stroke="#9ca3af" fontSize={12} />
                               <Tooltip contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: 'white' }} />
                               <Legend />
                               <Line type="monotone" dataKey="NodeA" stroke="#8b5cf6" strokeWidth={3} dot={{r:4}} activeDot={{r: 6}} />
                               <Line type="monotone" dataKey="NodeB" stroke="#3b82f6" strokeWidth={3} dot={{r:4}} activeDot={{r: 6}} />
                             </LineChart>
                          </ResponsiveContainer>
                          )}
                       </div>
                    </div>

                    {/* Comparison Chart */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 md:p-5 shadow-sm relative overflow-hidden group">
                       <Microscope className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 text-gray-50 dark:text-gray-900/10 rotate-[-15deg] transition-transform duration-[2s] group-hover:scale-110 group-hover:-translate-x-[40%] z-0 pointer-events-none" />
                       <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
                           <h3 className="text-base md:text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                               <Bug className="w-5 h-5 text-emerald-500" />
                               Perbandingan Efektivitas
                           </h3>
                           <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                               {isDemoMode && (
                                   <select
                                       value={effectTimeDuration}
                                       onChange={(e) => setEffectTimeDuration(e.target.value)}
                                       className="w-full sm:w-auto bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-xs rounded-lg focus:ring-emerald-500 focus:border-emerald-500 p-1.5 outline-none"
                                   >
                                       {effectTimeRange === 'hari' && <>
                                           <option value="hari_ini">Hari Ini</option>
                                           <option value="3_hari">3 Hari Terakhir</option>
                                           <option value="7_hari">7 Hari Terakhir</option>
                                       </>}
                                       {effectTimeRange === 'minggu' && <>
                                           <option value="minggu_ini">Minggu Ini</option>
                                           <option value="4_minggu">4 Minggu Terakhir</option>
                                           <option value="7_minggu">7 Minggu Terakhir</option>
                                       </>}
                                       {effectTimeRange === 'bulan' && <>
                                           <option value="bulan_ini">Bulan Ini</option>
                                           <option value="3_bulan">3 Bulan Terakhir</option>
                                           <option value="6_bulan">6 Bulan Terakhir</option>
                                       </>}
                                       {effectTimeRange === 'tahun' && <>
                                           <option value="tahun_ini">Tahun Ini</option>
                                           <option value="2_tahun">1-2 Tahun Terakhir</option>
                                           <option value="5_tahun">5 Tahun Terakhir</option>
                                       </>}
                                   </select>
                               )}
                               <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1 border border-gray-200 dark:border-gray-700 w-full sm:w-auto">
                                   {(['total', 'rata-rata'] as const).map(m => (
                                       <button 
                                           key={m}
                                           onClick={() => setEffectViewMode(m)}
                                           className={cn(
                                               "px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors flex-1 text-center",
                                               effectViewMode === m ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 shadow-sm border border-emerald-200 dark:border-emerald-800" : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                                           )}
                                       >
                                           {m}
                                       </button>
                                   ))}
                               </div>
                               <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1 border border-gray-200 dark:border-gray-700 w-full sm:w-auto">
                                   {(['hari', 'minggu', 'bulan', 'tahun'] as const).map(t => (
                                       <button 
                                           key={t}
                                           onClick={() => {
                                               setEffectTimeRange(t);
                                               setEffectTimeDuration(t + '_ini');
                                           }}
                                           className={cn(
                                               "px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors flex-1 text-center",
                                               effectTimeRange === t ? "bg-white dark:bg-gray-600 text-emerald-600 dark:text-emerald-400 shadow-sm" : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                                           )}
                                       >
                                           {t}
                                       </button>
                                   ))}
                               </div>
                           </div>
                       </div>
                       <div className="relative w-full h-64 md:h-72 min-h-[200px]">
                          {isDataLoading ? (
                             <div className="w-full h-full flex items-end justify-center gap-8 pb-8 pt-4 relative overflow-hidden">
                                <div className="absolute top-1/2 left-0 w-full border-t-2 border-dashed border-gray-300 dark:border-gray-600 top-1/2 -mt-4 opacity-50 z-0"></div>
                                <div className="w-16 md:w-20 bg-gray-100 dark:bg-gray-700/50 rounded-t-lg animate-pulse backdrop-blur-sm z-10" style={{ height: '70%' }}></div>
                                <div className="w-16 md:w-20 bg-gray-100 dark:bg-gray-700/50 rounded-t-lg animate-pulse backdrop-blur-sm z-10" style={{ height: '45%' }}></div>
                             </div>
                          ) : (isDemoMode ? effectChartData.NodeA === 0 && effectChartData.NodeB === 0 : nodeA.uv365 === 0 && nodeB.uv395 === 0) ? (
                             <div className="w-full h-full flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                                <Bug className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
                                <p className="text-gray-500 dark:text-gray-400 font-medium text-sm">Tidak ada data untuk dibandingkan</p>
                                <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">Data tangkapan masing-masing node akan dibandingkan di sini.</p>
                             </div>
                          ) : (
                           <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                              <BarChart data={[{ 
                                  name: isDemoMode ? (effectViewMode === 'rata-rata' ? 'Rata-rata Tangkapan' : 'Total Tangkapan') : 'Total Tangkapan', 
                                  NodeA: isDemoMode ? effectChartData.NodeA : nodeA.uv365, 
                                  NodeB: isDemoMode ? effectChartData.NodeB : nodeB.uv395 
                              }]}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                  <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} />
                                  <YAxis stroke="#9ca3af" fontSize={12} />
                                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: 'white' }} cursor={{fill: 'rgba(255,255,255,0.05)'}}/>
                                  <Legend />
                                  <Bar dataKey="NodeA" name="UV 365 nm" fill="#8b5cf6" radius={[6,6,0,0]} barSize={40} />
                                  <Bar dataKey="NodeB" name="UV 395 nm" fill="#3b82f6" radius={[6,6,0,0]} barSize={40} />
                              </BarChart>
                           </ResponsiveContainer>
                          )}
                       </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6" id="log-section">
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 md:p-5 lg:col-span-2 shadow-sm relative overflow-hidden">
                   <List className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 text-gray-50 dark:text-gray-900/10 rotate-[5deg] z-0 pointer-events-none" />
                   <div className="relative z-10 flex justify-between items-center mb-4">
                       <h3 className="text-base md:text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                           <Bug className="w-5 h-5 text-emerald-500" />
                           Log Deteksi Sensor (Real-time)
                       </h3>
                       <div className="flex gap-2 items-center">
                           <button onClick={handleDownloadExcel} className="px-3 py-1.5 flex items-center gap-1.5 rounded-lg text-emerald-700 bg-emerald-100 hover:bg-emerald-200 dark:text-emerald-300 dark:bg-emerald-900/40 dark:hover:bg-emerald-900/60 transition-colors text-sm font-semibold" title="Unduh Database Lengkap (Excel)">
                              <Download className="w-4 h-4"/>
                              <span className="hidden sm:inline">Unduh Excel</span>
                           </button>
                           <button onClick={syncToGoogleSheet} disabled={isSyncingSheet} className="px-3 py-1.5 flex items-center gap-1.5 rounded-lg text-blue-700 bg-blue-100 hover:bg-blue-200 dark:text-blue-300 dark:bg-blue-900/40 dark:hover:bg-blue-900/60 transition-colors text-sm font-semibold disabled:opacity-50" title="Kirim ke Google Sheet">
                              {isSyncingSheet ? <Loader2 className="w-4 h-4 animate-spin"/> : <Database className="w-4 h-4"/>}
                              <span className="hidden sm:inline">Simpan API</span>
                           </button>
                           {isDemoMode && (
                             <button onClick={generateLogsSync} className="p-1.5 rounded-lg text-emerald-600 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 transition-colors" title="Sinkronisasi Log">
                                <RotateCcw className="w-5 h-5"/>
                             </button>
                           )}
                       </div>
                   </div>
                   <div className="flex flex-col sm:flex-row gap-2 mb-4 bg-gray-50 dark:bg-gray-800/50 p-2 sm:p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                       <select 
                           value={filterSource}
                           onChange={(e) => setFilterSource(e.target.value)}
                           className="flex-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 p-2 outline-none"
                       >
                           <option value="all">Semua Node (Sumber)</option>
                           <option value="Node A (UV 365 nm)">Node A (UV 365 nm)</option>
                           <option value="Node B (UV 395 nm)">Node B (UV 395 nm)</option>
                       </select>
                       <input 
                           type="date"
                           value={filterStartDate}
                           onChange={(e) => setFilterStartDate(e.target.value)}
                           className="flex-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 p-2 outline-none"
                           title="Tanggal Mulai"
                       />
                       <input 
                           type="date"
                           value={filterEndDate}
                           onChange={(e) => setFilterEndDate(e.target.value)}
                           className="flex-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 p-2 outline-none"
                           title="Tanggal Akhir"
                       />
                   </div>
                   <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 max-h-80 overflow-y-auto">
                       <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400 whitespace-nowrap">
                           <thead className="text-xs text-gray-700 dark:text-gray-300 uppercase bg-gray-50 dark:bg-gray-900 sticky top-0">
                               <tr>
                                   <th className="px-4 py-3">Waktu (Timestamp)</th>
                                   <th className="px-4 py-3">Sumber Node</th>
                                   <th className="px-4 py-3">Aksi Deteksi</th>
                               </tr>
                           </thead>
                           <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                               {isDataLoading ? (
                                   Array.from({ length: 4 }).map((_, i) => (
                                       <tr key={i} className="animate-pulse">
                                           <td className="px-4 py-3"><div className="h-4 bg-gray-200 dark:bg-gray-700/50 rounded w-24"></div></td>
                                           <td className="px-4 py-3"><div className="h-4 bg-gray-200 dark:bg-gray-700/50 rounded w-32"></div></td>
                                           <td className="px-4 py-3"><div className="h-4 bg-gray-200 dark:bg-gray-700/50 rounded w-20"></div></td>
                                       </tr>
                                   ))
                               ) : paginatedLogs.length === 0 ? (
                                   <tr>
                                       <td colSpan={3} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">
                                           <SatelliteDish className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                                           {logs.length === 0 ? "Menunggu koneksi dan data masuk..." : "Tidak ada log yang sesuai dengan filter."}
                                       </td>
                                   </tr>
                               ) : paginatedLogs.map((log) => (
                                   <tr 
                                       key={log.id} 
                                       className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition cursor-help relative group"
                                       title={`Detail Aktivitas:\nWaktu: ${new Date(log.timestamp).toLocaleString('id-ID')}\nSumber: ${log.source}\nAksi Lengkap: Hama terdeteksi memotong pancaran sensor inframerah (${log.action || 'IR Terpicu (+1)'}). Data berhasil direkam sistem.`}
                                   >
                                       <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-200">{new Date(log.timestamp).toLocaleTimeString('id-ID')}</td>
                                       <td className="px-4 py-3 dark:text-gray-300">{log.source}</td>
                                       <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                           <CheckCircle2 className="w-4 h-4"/> 
                                           <span className="underline decoration-emerald-300 dark:decoration-emerald-700 decoration-dashed underline-offset-4">{log.action || 'IR Terpicu (+1)'}</span>
                                       </td>
                                   </tr>
                               ))}
                           </tbody>
                       </table>
                   </div>
                   
                   {/* Pagination Controls */}
                   {totalLogPages > 1 && (
                       <div className="flex items-center justify-between mt-4">
                           <span className="text-sm text-gray-500 dark:text-gray-400">
                               Menampilkan {(logCurrentPage - 1) * logsPerPage + 1} - {Math.min(logCurrentPage * logsPerPage, filteredLogs.length)} dari {filteredLogs.length} data
                           </span>
                           <div className="flex gap-1">
                               <button 
                                   onClick={() => setLogCurrentPage(p => Math.max(1, p - 1))}
                                   disabled={logCurrentPage === 1}
                                   className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300 rounded disabled:opacity-50 transition-colors"
                               >
                                   Mundur
                               </button>
                               <div className="px-3 py-1 text-sm bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded font-semibold border border-emerald-100 dark:border-emerald-800">
                                   {logCurrentPage} / {totalLogPages}
                               </div>
                               <button 
                                   onClick={() => setLogCurrentPage(p => Math.min(totalLogPages, p + 1))}
                                   disabled={logCurrentPage === totalLogPages}
                                   className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300 rounded disabled:opacity-50 transition-colors"
                               >
                                   Maju
                               </button>
                           </div>
                       </div>
                   )}
                </div>

                {isDemoMode && (
                <div className="bg-emerald-50/50 dark:bg-emerald-900/20 rounded-2xl p-4 md:p-5 border border-emerald-100 dark:border-emerald-800/30">
                   <div className="flex items-center gap-2 mb-4">
                       <Microscope className="text-emerald-600 dark:text-emerald-400 w-6 h-6" />
                       <h3 className="text-base md:text-lg font-bold text-emerald-900 dark:text-emerald-400">Modul Evaluasi Akurasi</h3>
                   </div>
                   <p className="text-xs text-emerald-700 dark:text-emerald-300/70 mb-4 leading-relaxed">
                       Masukkan jumlah tangkapan fisik (manual) di toples pagi hari untuk menghitung error rate pembacaan sensor IR.
                   </p>
                   <div className="space-y-4">
                       <div>
                           <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tangkapan Fisik 365 nm (Node A)</label>
                           <input type="number" value={manual365} onChange={e=>setManual365(e.target.value)} placeholder="Contoh: 140" className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5 transition-colors"/>
                       </div>
                       <div>
                           <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tangkapan Fisik 395 nm (Node B)</label>
                           <input type="number" value={manual395} onChange={e=>setManual395(e.target.value)} placeholder="Contoh: 95" className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5 transition-colors"/>
                       </div>
                       <button onClick={calculateAccuracy} className="w-full text-white bg-emerald-600 hover:bg-emerald-700 focus:ring-4 focus:ring-emerald-300 font-medium rounded-lg text-sm px-5 py-3 transition text-center shadow-md">
                           Kalkulasi Akurasi Sensor
                       </button>

                       {evaluation && (
                           <div className="mt-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 transition-all">
                               <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-3">Hasil Evaluasi Error Rate:</h4>
                               <div className="flex justify-between items-center text-sm mb-2 pb-2 border-b border-gray-100 dark:border-gray-700">
                                   <span className="text-gray-600 dark:text-gray-300">Sensor 365 nm:</span>
                                   <span className={cn("font-bold text-gray-800 dark:text-white", evaluation.err365 <= 5 ? "text-green-500" : evaluation.err365 <= 10 ? "text-yellow-500" : "text-red-500")}>{evaluation.err365.toFixed(2)}%</span>
                               </div>
                               <div className="flex justify-between items-center text-sm">
                                   <span className="text-gray-600 dark:text-gray-300">Sensor 395 nm:</span>
                                   <span className={cn("font-bold text-gray-800 dark:text-white", evaluation.err395 <= 5 ? "text-green-500" : evaluation.err395 <= 10 ? "text-yellow-500" : "text-red-500")}>{evaluation.err395.toFixed(2)}%</span>
                               </div>
                           </div>
                       )}
                   </div>
                </div>
                )}
            </div>

            <footer className="mt-8 text-center text-xs text-gray-400 dark:text-gray-500 pb-4">
                &copy; 2026 Riyan (2305125) - Politeknik LPP Yogyakarta. Sistem Monitoring Light Trap UPDKS.
            </footer>
         </div>
      </main>

      {/* Settings Modal */}
      {isSettingsOpen && (
          <div className="fixed inset-0 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center transition-opacity" onClick={(e) => e.target === e.currentTarget && setSettingsOpen(false)}>
              <div className="bg-white dark:bg-gray-800 w-[90%] max-w-sm rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                      <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2"><SettingsIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400"/> Pengaturan Halaman</h3>
                      <button onClick={() => setSettingsOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                          <X className="w-5 h-5"/>
                      </button>
                  </div>
                  <div className="p-5 space-y-6">
                      <div>
                          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Sumber Data (Koneksi)</label>
                          <div className="flex items-center bg-emerald-50 dark:bg-emerald-900/30 rounded-lg p-1.5 border border-emerald-200 dark:border-emerald-800 cursor-pointer w-full" onClick={() => {
                              const newVal = !isDemoMode;
                              setIsDemoMode(newVal);
                              localStorage.setItem('isDemoMode', String(newVal));
                              
                              // Logout otomatis saat berpindah mode
                              setUserProfile(null);
                              localStorage.removeItem('userProfile');
                              setSheetSettingsOpen(false); // Opsional tutup modal settings
                          }}>
                              <div className={cn("flex-1 text-center py-2.5 text-xs sm:text-sm font-bold rounded-md transition-all", isDemoMode ? "bg-white dark:bg-emerald-700 shadow-sm text-emerald-700 dark:text-white" : "text-emerald-600 dark:text-emerald-400")}>
                                  DATA DEMO
                              </div>
                              <div className={cn("flex-1 text-center py-2.5 text-xs sm:text-sm font-bold rounded-md transition-all", !isDemoMode ? "bg-white dark:bg-emerald-700 shadow-sm text-emerald-700 dark:text-white" : "text-emerald-600 dark:text-emerald-400")}>
                                  DATA ASLI
                              </div>
                          </div>
                      </div>
                      <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Tema Tampilan</label>
                          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1.5 border border-gray-200 dark:border-gray-700 w-full justify-between gap-1">
                              {['light', 'system', 'dark'].map((t) => (
                                  <button key={t} onClick={() => {
                                      setTheme(t as any);
                                      localStorage.setItem('theme', t);
                                      setSettingsOpen(false);
                                  }} className={cn("flex-1 py-2 rounded-md flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 transition-colors text-xs font-medium capitalize", theme === t ? "bg-white dark:bg-gray-600 shadow-sm text-emerald-600 dark:text-emerald-400" : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-300")}>
                                      {t === 'light' ? 'Terang' : t === 'dark' ? 'Gelap' : 'Sistem'}
                                  </button>
                              ))}
                          </div>
                      </div>
                  </div>
                  <div className="px-5 py-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 text-center">
                      <button onClick={() => setSettingsOpen(false)} className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">Tutup Pengaturan</button>
                  </div>
              </div>
          </div>
      )}

      {/* Login Modal */}
      <AnimatePresence>
      {isLoginModalOpen && (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center" onClick={(e) => {
            if(e.target === e.currentTarget) {
               setLoginModalOpen(false);
            }
        }}>
            <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl w-[95%] max-w-sm sm:max-w-md rounded-3xl shadow-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden"
            >
                <div className="p-6 sm:p-8">
                    <div className="flex justify-between items-center mb-8">
                        <h3 className="font-extrabold text-2xl text-gray-900 dark:text-white tracking-tight">
                            {loginMode === 'login' ? 'Masuk' : 'Daftar Akun'}
                        </h3>
                        <button onClick={() => setLoginModalOpen(false)} className="text-gray-400 hover:text-gray-900 dark:hover:text-white bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 p-2 rounded-full transition-colors" disabled={loginSuccess}>
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    {loginSuccess ? (
                        <motion.div 
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="py-12 flex flex-col items-center justify-center"
                        >
                            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mb-4">
                                <CheckCircle2 className="w-10 h-10" />
                            </div>
                            <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Berhasil!</h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400 text-center">Redirecting...</p>
                        </motion.div>
                    ) : (
                    <>
                    {loginError && (
                        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2 text-red-600 dark:text-red-400 text-sm">
                            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                            <span>{loginError}</span>
                        </div>
                    )}
                    <form onSubmit={(e) => { e.preventDefault(); submitAuth(); }} className="space-y-5 max-h-[70vh] overflow-y-auto px-1 scrollbar-hide">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5 ml-1">Email</label>
                            <input 
                                type="email" 
                                value={loginEmail} 
                                onChange={(e) => { setLoginEmail(e.target.value); setLoginError(''); }} 
                                className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white text-sm rounded-xl focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 block p-3.5 outline-none transition-all" 
                                placeholder="nama@contoh.com"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5 ml-1">Password</label>
                            <div className="relative">
                                <input 
                                    type={showPassword ? "text" : "password"} 
                                    value={loginPassword} 
                                    onChange={(e) => { setLoginPassword(e.target.value); setLoginError(''); }} 
                                    className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white text-sm rounded-xl focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 block p-3.5 pr-11 outline-none transition-all" 
                                    placeholder="••••••••"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-2 flex items-center p-2 text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors rounded-lg"
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                            {loginMode === 'register' && (
                                <div className="mt-4 space-y-2 animate-in fade-in duration-300">
                                    <div className="flex gap-1 h-1.5 w-full">
                                        {[1, 2, 3, 4].map((step) => (
                                            <div 
                                                key={step} 
                                                className={`h-full flex-1 rounded-full transition-colors duration-300 ${getPasswordStrength(loginPassword) >= step ? getStrengthColor(getPasswordStrength(loginPassword)) : 'bg-gray-200 dark:bg-gray-800'}`}
                                            ></div>
                                        ))}
                                    </div>
                                    <div className="flex items-center justify-between mt-1">
                                       <span className={`text-[10px] sm:text-xs font-semibold ${getPasswordStrength(loginPassword) === 4 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                          Kekuatan: {getStrengthLabel(getPasswordStrength(loginPassword))}
                                       </span>
                                       <span className="text-[10px] text-gray-400 max-w-[200px] text-right">
                                          Huruf besar, kecil, angka & simbol.
                                       </span>
                                    </div>
                                </div>
                            )}
                        </div>
                        {loginMode === 'register' && (
                            <div className="space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5 ml-1">Nama Lengkap</label>
                                    <input 
                                        type="text" 
                                        value={loginName} 
                                        onChange={(e) => setLoginName(e.target.value)} 
                                        className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white text-sm rounded-xl focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 block p-3.5 outline-none transition-all" 
                                        placeholder="Opsional"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <ImageUpload 
                                        label="Foto Profil" 
                                        icon={Camera} 
                                        value={loginPhoto} 
                                        onImageUploaded={setLoginPhoto} 
                                        type="photo" 
                                    />
                                    <ImageUpload 
                                        label="Foto Sampul" 
                                        icon={ImageIcon} 
                                        value={loginCover} 
                                        onImageUploaded={setLoginCover} 
                                        type="cover" 
                                    />
                                </div>
                            </div>
                        )}
                        <button type="submit" disabled={isAuthLoading} className="w-full mt-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-all hover:shadow-lg hover:shadow-emerald-600/20 active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70 disabled:hover:scale-100">
                            {isAuthLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
                            {loginMode === 'login' ? 'Masuk' : 'Daftar Sekarang'}
                        </button>
                    </form>
                    <div className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
                        {loginMode === 'login' ? "Belum punya akun?" : "Sudah punya akun?"}{' '}
                        <button type="button" onClick={() => { setLoginMode(loginMode === 'login' ? 'register' : 'login'); setLoginError(''); }} className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-bold transition-colors underline decoration-2 underline-offset-4" disabled={loginSuccess}>
                            {loginMode === 'login' ? 'Daftar di sini' : 'Masuk di sini'}
                        </button>
                    </div>
                    </>
                    )}
                </div>
            </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Profile Modal */}
      {isProfileOpen && (
          <div className="fixed inset-0 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center transition-opacity" onClick={(e) => {
              if(e.target === e.currentTarget) {
                 setProfileOpen(false);
                 setIsEditingProfile(false);
              }
          }}>
              <div className="bg-white dark:bg-gray-800 w-[90%] max-w-sm rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden transform scale-100 transition-transform">
                  
                  {isEditingProfile ? (
                     <div className="flex flex-col max-h-[85vh]">
                        <div className="flex justify-between items-center p-5 sm:p-6 border-b border-gray-100 dark:border-gray-700/50 shrink-0">
                            <h3 className="font-bold text-lg text-gray-900 dark:text-white">Edit Profil</h3>
                            <button onClick={() => setIsEditingProfile(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                               <X className="w-5 h-5"/>
                            </button>
                        </div>
                        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto custom-scrollbar">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nama Lengkap</label>
                                <input type="text" value={editName} onChange={e=>setEditName(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5 outline-none" />
                            </div>
                            <ImageUpload 
                                label="Foto Profil" 
                                icon={Camera} 
                                value={editPhotoUrl} 
                                onImageUploaded={setEditPhotoUrl} 
                                type="photo" 
                            />
                            <ImageUpload 
                                label="Foto Sampul" 
                                icon={ImageIcon} 
                                value={editCoverUrl} 
                                onImageUploaded={setEditCoverUrl} 
                                type="cover" 
                            />
                            
                            <hr className="border-gray-200 dark:border-gray-700 my-2" />
                            
                            <div>
                                <label className="flex items-center justify-between cursor-pointer">
                                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Notifikasi</span>
                                  <div className="relative">
                                    <input type="checkbox" className="sr-only" checked={editNotificationsEnabled} onChange={(e) => setEditNotificationsEnabled(e.target.checked)} />
                                    <div className={`block w-10 h-6 rounded-full transition-colors ${editNotificationsEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}></div>
                                    <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${editNotificationsEnabled ? 'transform translate-x-4' : ''}`}></div>
                                  </div>
                                </label>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Satuan Suhu Default</label>
                                <select 
                                    value={editTemperatureUnit} 
                                    onChange={e=>setEditTemperatureUnit(e.target.value as 'C'|'F')} 
                                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5 outline-none"
                                >
                                    <option value="C">Celsius (°C)</option>
                                    <option value="F">Fahrenheit (°F)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Satuan Tegangan Default</label>
                                <select 
                                    value={editVoltageUnit} 
                                    onChange={e=>setEditVoltageUnit(e.target.value as 'V'|'mV')} 
                                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5 outline-none"
                                >
                                    <option value="V">Volt (V)</option>
                                    <option value="mV">Milivolt (mV)</option>
                                </select>
                            </div>

                            <button onClick={handleSaveProfile} className="w-full mt-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                                <Save className="w-4 h-4" /> Simpan Perubahan
                            </button>
                        </div>
                     </div>
                  ) : (
                    <>
                      <div 
                         className="relative w-full aspect-[3/1] bg-gray-200 dark:bg-gray-700 flex justify-center bg-cover bg-center shrink-0"
                         style={userProfile?.coverUrl ? { backgroundImage: `url(${userProfile.coverUrl})` } : { backgroundImage: 'linear-gradient(to right, #10b981, #14b8a6)' }}
                      >
                          <button onClick={() => setProfileOpen(false)} className="absolute top-3 right-3 text-white hover:bg-black/20 p-1.5 rounded-full backdrop-blur-sm transition-colors z-10">
                              <X className="w-5 h-5 drop-shadow-md"/>
                          </button>
                          <button onClick={handleOpenEditProfile} className="absolute top-3 left-3 text-white hover:bg-black/20 p-1.5 rounded-full backdrop-blur-sm transition-colors z-10" title="Edit Profil">
                              <Edit2 className="w-4 h-4 drop-shadow-md"/>
                          </button>
                          <div className="absolute -bottom-10 border-4 border-white dark:border-gray-800 rounded-full bg-white dark:bg-gray-800 shadow-md">
                              <img src={userProfile.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(userProfile.displayName || 'User')}`} alt="avatar" className="w-20 h-20 rounded-full object-cover bg-white dark:bg-gray-800" />
                          </div>
                      </div>
                      <div className="pt-14 pb-6 px-6 text-center">
                          <h3 className="font-bold text-xl text-gray-900 dark:text-white">{userProfile.displayName || "User"}</h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{userProfile.email}</p>
                          
                          <div className="space-y-3">
                              <button onClick={() => { 
                                setIsLogoutConfirmOpen(true);
                              }} className="w-full py-2.5 bg-gray-50 text-red-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-red-400 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                                  Logout / Keluar Akun
                              </button>
                              <button onClick={() => { setProfileOpen(false); }} className="w-full py-2.5 bg-gray-50 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200  border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                                  Tutup
                              </button>
                          </div>
                      </div>
                    </>
                  )}
              </div>
          </div>
      )}

      {/* Logout Confirm Dialog */}
      {isLogoutConfirmOpen && (
        <div className="fixed inset-0 bg-gray-900/60 dark:bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center transition-opacity" onClick={(e) => {
            if(e.target === e.currentTarget) setIsLogoutConfirmOpen(false);
        }}>
            <div className="bg-white dark:bg-gray-800 w-[90%] max-w-sm rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 text-center">
                    <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-500 mx-auto flex items-center justify-center mb-4">
                        <RotateCcw className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Konfirmasi Logout</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Apakah Anda yakin ingin keluar dari akun ini? Sesi Anda akan dihentikan.</p>
                    <div className="flex gap-3">
                        <button onClick={() => setIsLogoutConfirmOpen(false)} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-semibold text-sm transition-colors">
                            Batal
                        </button>
                        <button onClick={() => {
                            setUserProfile(null);
                            localStorage.removeItem('userProfile');
                            setIsLogoutConfirmOpen(false);
                            setProfileOpen(false);
                        }} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold text-sm transition-colors shadow-sm focus:ring-4 focus:ring-red-200 dark:focus:ring-red-900">
                            Ya, Keluar
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      </div>
    </div>
  );
}

