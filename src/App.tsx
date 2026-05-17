import React, { useState, useEffect } from 'react';
import { Leaf, X, PieChart, List, Settings, Menu, Clock, Settings as SettingsIcon, Bug, Wifi, Battery, BatteryMedium, Lightbulb, RotateCcw, Microscope, SatelliteDish, CheckCircle2, Edit2, Camera, Save, Image as ImageIcon, Download } from 'lucide-react';
import { auth, db, signInWithPopup, GoogleAuthProvider, signOut, collection, onSnapshot, query, orderBy, limit, handleFirestoreError, OperationType, addDoc, doc, setDoc, updateProfile, where } from './firebase';
import { getDoc } from 'firebase/firestore';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

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
  const [isDemoMode, setIsDemoMode] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [time, setTime] = useState('');
  const [user, setUser] = useState(auth.currentUser);
  
  // Profile Edit States
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhotoUrl, setEditPhotoUrl] = useState('');
  const [editCoverUrl, setEditCoverUrl] = useState('');
  const [userProfile, setUserProfile] = useState<{ coverUrl?: string }>({});

  useEffect(() => {
    if (user) {
      const fetchProfile = async () => {
        try {
          const docRef = doc(db, 'users', user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setUserProfile(docSnap.data());
          }
        } catch (error) {
          console.error("Error fetching user profile", error);
        }
      };
      fetchProfile();
    }
  }, [user]);

  const handleSaveProfile = async () => {
    if (!user) return;
    try {
      if (editName !== user.displayName || editPhotoUrl !== user.photoURL) {
        await updateProfile(user, {
          displayName: editName,
          photoURL: editPhotoUrl,
        });
        // Force state update to re-render
        setUser({ ...user });
      }
      
      const docRef = doc(db, 'users', user.uid);
      await setDoc(docRef, { coverUrl: editCoverUrl }, { merge: true });
      setUserProfile(prev => ({ ...prev, coverUrl: editCoverUrl }));
      setIsEditingProfile(false);
    } catch (e) {
      console.error("Error updating profile", e);
    }
  };

  const handleOpenEditProfile = () => {
    setEditName(user?.displayName || '');
    setEditPhotoUrl(user?.photoURL || '');
    setEditCoverUrl(userProfile?.coverUrl || '');
    setIsEditingProfile(true);
  };


  // Data States
  const [nodeA, setNodeA] = useState({ uv365: 142, online: true, battery: 85, voltage: 13.6, led: true });
  const [nodeB, setNodeB] = useState({ uv395: 98, online: true, battery: 62, voltage: 13.1, led: true });
  const [logs, setLogs] = useState<any[]>([]);

  // Chart Data
  const [chartData, setChartData] = useState<any[]>([]);

  // Manual Inputs
  const [manual365, setManual365] = useState('');
  const [manual395, setManual395] = useState('');
  const [evaluation, setEvaluation] = useState<{ err365: number, err395: number } | null>(null);
  
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [notifications, setNotifications] = useState<{id: number, text: string}[]>([]);
  const prevOnlineRef = React.useRef({ A: true, B: true });

  const triggerEmailNotification = (nodeName: string) => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, text: `Sistem: Email peringatan telah dikirim (${nodeName} Offline)` }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  useEffect(() => {
    if (prevOnlineRef.current.A === true && nodeA.online === false) {
      triggerEmailNotification('Node A');
    }
    if (prevOnlineRef.current.B === true && nodeB.online === false) {
      triggerEmailNotification('Node B');
    }
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
    const unsub = auth.onAuthStateChanged((u) => {
      setUser(u);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date().toLocaleString('id-ID', {
        weekday: 'long', year: 'numeric', month: 'long',
        day: 'numeric', hour: '2-digit', minute: '2-digit'
      }));
    }, 1000);
    return () => clearInterval(interval);
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

  useEffect(() => {
    let unsubs: any[] = [];
    
    const initData = async () => {
      try {
        if (isDemoMode) {
          const demoRef = doc(db, 'demo_nodes', 'NodeA');
          const snap = await getDoc(demoRef);
          if (!snap.exists()) {
            await setDoc(doc(db, 'demo_nodes', 'NodeA'), { uv365: 142, online: true, battery: 85, voltage: 13.6, led: true });
            await setDoc(doc(db, 'demo_nodes', 'NodeB'), { uv395: 98, online: true, battery: 62, voltage: 13.1, led: true });
            const labels = ['18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '00:00', '01:00', '02:00', '03:00', '04:00', '05:00', '06:00'];
            const dataA = [2, 15, 30, 45, 25, 10, 5, 3, 2, 1, 2, 1, 1];
            const dataB = [1, 10, 20, 32, 18, 8, 4, 2, 1, 1, 0, 1, 0];
            for (let i = 0; i < labels.length; i++) {
              await setDoc(doc(db, 'demo_chart_data', String(i)), { time: labels[i], NodeA: dataA[i], NodeB: dataB[i], sort: i });
            }
            const sources = ['Node A (UV 365 nm)', 'Node B (UV 395 nm)'];
            let now = Date.now();
            for(let i=0; i<5; i++) {
              await addDoc(collection(db, 'demo_logs'), {
                timestamp: now - (Math.random() * 60000 * (i + 1)),
                source: sources[Math.floor(Math.random() * sources.length)],
                action: 'IR Terpicu (+1)'
              });
            }
          }
        } else if (user) {
          const nodeARef = doc(db, 'nodes', `NodeA_${user.uid}`);
          const snap = await getDoc(nodeARef);
          if (!snap.exists()) {
            await setDoc(nodeARef, { uv365: 0, online: true, battery: 100, voltage: 14.1, led: true, userId: user.uid });
            await setDoc(doc(db, 'nodes', `NodeB_${user.uid}`), { uv395: 0, online: true, battery: 100, voltage: 14.1, led: true, userId: user.uid });
            await setDoc(doc(db, 'chart_data', `0_${user.uid}`), { time: '00:00', NodeA: 0, NodeB: 0, sort: 0, userId: user.uid });
          }
        }
      } catch (err) {
        console.error("Init data error", err);
      }
    };

    if (isDemoMode || user) {
      initData().then(() => {
        // Setup listeners
        const prefix = isDemoMode ? 'demo_' : '';
        const uid = user ? user.uid : '';

        // 1. Nodes
        const nodeADoc = doc(db, `${prefix}nodes`, isDemoMode ? 'NodeA' : `NodeA_${uid}`);
        unsubs.push(onSnapshot(nodeADoc, (snap) => {
          if (snap.exists()) setNodeA(snap.data() as any);
        }));

        const nodeBDoc = doc(db, `${prefix}nodes`, isDemoMode ? 'NodeB' : `NodeB_${uid}`);
        unsubs.push(onSnapshot(nodeBDoc, (snap) => {
          if (snap.exists()) setNodeB(snap.data() as any);
        }));

        // 2. Chart Data
        const chartRef = collection(db, `${prefix}chart_data`);
        const qChart = isDemoMode ? query(chartRef, orderBy('sort', 'asc')) : query(chartRef, where('userId', '==', uid));
        unsubs.push(onSnapshot(qChart, (snap) => {
           let c: any[] = [];
           snap.forEach(d => c.push(d.data()));
           if (!isDemoMode) c.sort((a,b) => a.sort - b.sort);
           setChartData(c);
        }));

        // 3. Logs
        const logsRef = collection(db, `${prefix}logs`);
        const qLogs = isDemoMode ? query(logsRef, orderBy('timestamp', 'desc'), limit(15)) : query(logsRef, where('userId', '==', uid), limit(50));
        unsubs.push(onSnapshot(qLogs, (snap) => {
           let l: any[] = [];
           snap.forEach(d => l.push({ id: d.id, ...d.data() }));
           if (!isDemoMode) {
             l.sort((a,b) => b.timestamp - a.timestamp);
             l = l.slice(0, 15);
           }
           setLogs(l);
        }, (err) => handleFirestoreError(err, OperationType.GET, `${prefix}logs`)));

      });
    } else {
      setNodeA({ uv365: 0, online: false, battery: 0, voltage: 0, led: false });
      setNodeB({ uv395: 0, online: false, battery: 0, voltage: 0, led: false });
      setChartData([]);
      setLogs([]);
    }

    return () => {
       unsubs.forEach(u => u());
    };
  }, [isDemoMode, user]);

  const generateLogsSync = async () => {
    try {
      const prefix = isDemoMode ? 'demo_' : '';
      const uid = user ? user.uid : null;
      if (!isDemoMode && !uid) return;
      
      const sources = ['Node A (UV 365 nm)', 'Node B (UV 395 nm)'];
      const source = sources[Math.floor(Math.random() * sources.length)];
      
      const isNodeA = source.includes('365');
      
      const newLog: any = {
        timestamp: Date.now(),
        source: source,
        action: 'IR Terpicu (+1)',
      };
      if (!isDemoMode && uid) {
        newLog.userId = uid;
      }
      
      await addDoc(collection(db, `${prefix}logs`), newLog);

      // Increment count on Nodes
      const nodeDoc = doc(db, `${prefix}nodes`, isDemoMode ? (isNodeA ? 'NodeA' : 'NodeB') : (isNodeA ? `NodeA_${uid}` : `NodeB_${uid}`));
      const snap = await getDoc(nodeDoc);
      if (snap.exists()) {
        const d = snap.data();
        if (isNodeA) {
          await setDoc(nodeDoc, { uv365: (d.uv365 || 0) + 1 }, { merge: true });
        } else {
          await setDoc(nodeDoc, { uv395: (d.uv395 || 0) + 1 }, { merge: true });
        }
      }

    } catch(e) {
      handleFirestoreError(e, OperationType.WRITE, 'logs');
    }
  };

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
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
      const logData = logs.map(log => ({
        'Waktu': new Date(log.timestamp).toLocaleString('id-ID'),
        'Sumber Node': log.source,
        'Aksi Deteksi': log.action || 'IR Terpicu (+1)'
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
          'Tegangan (V)': nodeA.voltage,
          'LED': nodeA.led ? 'Nyala' : 'Mati'
        },
        {
          'Nama Node': 'Node B (UV 395nm)',
          'Total Tangkapan': nodeB.uv395,
          'Status': nodeB.online ? 'Online' : 'Offline',
          'Baterai (%)': nodeB.battery,
          'Tegangan (V)': nodeB.voltage,
          'LED': nodeB.led ? 'Nyala' : 'Mati'
        }
      ];
      const wsNodes = XLSX.utils.json_to_sheet(nodesData);
      XLSX.utils.book_append_sheet(wb, wsNodes, "Status Sensor");

      if (user) {
         const userData = [{
             'Nama': user.displayName || 'Anonim',
             'Email': user.email || 'Tidak ada',
             'User ID': user.uid,
             'Status Pengguna': isDemoMode ? 'Mode Demo' : 'Mode Terhubung',
         }];
         const wsUser = XLSX.utils.json_to_sheet(userData);
         XLSX.utils.book_append_sheet(wb, wsUser, "Data Pengguna");
      }

      // Save the file
      XLSX.writeFile(wb, `Database_Lengkap_${new Date().toISOString().slice(0, 10)}.xlsx`);
    });
  };

  return (
    <div className="flex h-screen overflow-hidden text-gray-800 bg-gray-100 dark:bg-[#111827] dark:text-gray-200 transition-colors duration-300 font-sans">
      
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
          <button onClick={() => { document.getElementById('dashboard-top')?.scrollIntoView({ behavior: 'smooth' }); setSidebarOpen(false); }} className="w-full flex items-center gap-3 bg-emerald-800 text-white p-3 rounded-lg font-medium transition text-left">
            <PieChart className="w-5 h-5"/> Dashboard
          </button>
          
          {(!nodeA.online || !nodeB.online) && (
             <div className="mt-6 p-3 bg-red-900/40 border border-red-500/50 rounded-lg animate-pulse">
                <div className="flex items-center gap-2 text-red-400 font-bold text-sm mb-1">
                    <Wifi className="w-4 h-4" />
                    Node Terputus!
                </div>
                <p className="text-xs text-red-200">
                    {!nodeA.online && !nodeB.online 
                        ? "Node A (365nm) dan Node B (395nm) sedang offline. Periksa alat segera." 
                        : !nodeA.online 
                        ? "Node A (365nm) sedang offline. Periksa koneksi atau baterai." 
                        : "Node B (395nm) sedang offline. Periksa koneksi atau baterai."}
                </p>
             </div>
          )}
        </nav>
        <div className="p-4 border-t border-emerald-800 w-full block">
          {user ? (
            <div className="flex items-center justify-between gap-3 w-full">
              <div className="flex items-center gap-3 w-full cursor-pointer hover:bg-emerald-800 p-2 rounded-lg transition-colors" onClick={() => { setProfileOpen(true); setSidebarOpen(false); }}>
                <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} alt="avatar" className="w-10 h-10 rounded-full shrink-0" />
                <div className="overflow-hidden flex-1">
                  <p className="text-sm font-semibold truncate w-full">{user.displayName || "User"}</p>
                  <p className="text-xs text-emerald-300 truncate w-full">{user.email || "user@example.com"}</p>
                </div>
              </div>
            </div>
          ) : (
            <button onClick={handleLogin} className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-600 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2 shadow-sm border border-emerald-600">
              <div className="bg-white p-0.5 rounded-full"><img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="G" className="w-4 h-4" /></div>
              Login dengan Google
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
         <header className="bg-white dark:bg-gray-800 h-16 flex items-center justify-between px-4 lg:px-8 border-b border-gray-200 dark:border-gray-700 shrink-0 z-10 shadow-sm transition-colors duration-300">
            <div className="flex items-center gap-4">
               <button className="md:hidden text-gray-500 hover:text-gray-700 dark:hover:text-white focus:outline-none" onClick={() => setSidebarOpen(true)}>
                  <Menu className="w-6 h-6"/>
               </button>
               <h2 className="text-base sm:text-lg md:text-xl font-semibold text-gray-800 dark:text-white truncate">Ringkasan Pengamatan</h2>
            </div>
            <div className="flex items-center gap-3 md:gap-4">
                {!isOnline && (
                  <div className="text-xs sm:text-sm font-semibold px-2 sm:px-3 py-1 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800 flex items-center gap-1.5 shadow-sm">
                     <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span> Offline Mode
                  </div>
                )}
                <div className="text-sm text-gray-500 dark:text-gray-400 font-medium hidden lg:flex items-center gap-2">
                    <Clock className="w-4 h-4" /> <span>{time || '--/--/---- --:--'}</span>
                </div>
                <button 
                  onClick={() => setSettingsOpen(true)}
                  className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors flex items-center justify-center shadow-sm border border-gray-200 dark:border-gray-700 focus:outline-none"
                >
                    <SettingsIcon className="w-5 h-5"/>
                </button>
            </div>
         </header>

         <div className="flex-1 overflow-y-auto p-4 lg:p-8" id="dashboard-top">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6 mb-6">
                
                {/* Node A */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border-l-4 border-l-purple-500 shadow-sm">
                   <div className="flex justify-between items-start">
                       <div>
                          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-1">Total Tangkapan Sensor</p>
                          <h3 className="text-2xl font-bold text-gray-800 dark:text-white">Node A <span className="text-purple-600 dark:text-purple-400 text-sm">(365 nm)</span></h3>
                       </div>
                       <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/40 rounded-full flex items-center justify-center text-purple-600 dark:text-purple-400">
                          <Bug className="w-6 h-6"/>
                       </div>
                   </div>
                   <div className="mt-4 flex items-end gap-2">
                       <span className="text-4xl font-bold text-gray-900 dark:text-white transition-all duration-300">{nodeA.uv365}</span>
                       <span className="text-sm text-gray-500 dark:text-gray-400 mb-1">ngengat</span>
                   </div>
                </div>

                {/* Node B */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border-l-4 border-l-blue-500 shadow-sm">
                   <div className="flex justify-between items-start">
                       <div>
                          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-1">Total Tangkapan Sensor</p>
                          <h3 className="text-2xl font-bold text-gray-800 dark:text-white">Node B <span className="text-blue-600 dark:text-blue-400 text-sm">(395 nm)</span></h3>
                       </div>
                       <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/40 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400">
                          <Bug className="w-6 h-6"/>
                       </div>
                   </div>
                   <div className="mt-4 flex items-end gap-2">
                       <span className="text-4xl font-bold text-gray-900 dark:text-white transition-all duration-300">{nodeB.uv395}</span>
                       <span className="text-sm text-gray-500 dark:text-gray-400 mb-1">ngengat</span>
                   </div>
                </div>

                {/* Node A Status */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm">
                   <div className="flex justify-between items-center mb-4">
                       <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Status Node A (365nm)</h3>
                       <span className={cn("px-2 py-1 text-xs font-bold rounded-full border flex items-center gap-1", nodeA.online ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800" : "bg-gray-100 text-gray-500")}>
                           <Wifi className="w-3 h-3"/> {nodeA.online ? 'Online' : 'Offline'}
                       </span>
                   </div>
                   <div className="space-y-3">
                       <div>
                           <div className="flex justify-between text-xs mb-1">
                               <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1"><Battery className="w-3 h-3"/> Baterai</span>
                               <span className="font-bold text-gray-700 dark:text-gray-300">{nodeA.battery}% ({nodeA.voltage}V)</span>
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
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm">
                   <div className="flex justify-between items-center mb-4">
                       <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Status Node B (395nm)</h3>
                       <span className={cn("px-2 py-1 text-xs font-bold rounded-full border flex items-center gap-1", nodeB.online ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800" : "bg-gray-100 text-gray-500")}>
                           <Wifi className="w-3 h-3"/> {nodeB.online ? 'Online' : 'Offline'}
                       </span>
                   </div>
                   <div className="space-y-3">
                       <div>
                           <div className="flex justify-between text-xs mb-1">
                               <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1"><BatteryMedium className="w-3 h-3"/> Baterai</span>
                               <span className="font-bold text-gray-700 dark:text-gray-300">{nodeB.battery}% ({nodeB.voltage}V)</span>
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 mb-6">
                {/* Arrival Chart */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 md:p-5 lg:col-span-2 shadow-sm">
                   <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
                       <h3 className="text-base md:text-lg font-bold text-gray-800 dark:text-white">Fluktuasi Waktu Kedatangan</h3>
                   </div>
                   <div className="relative w-full h-64 md:h-72 min-h-[200px]">
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
                   </div>
                </div>

                {/* Comparison Chart */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 md:p-5 shadow-sm">
                   <h3 className="text-base md:text-lg font-bold text-gray-800 dark:text-white mb-4">Perbandingan Efektivitas</h3>
                   <div className="relative w-full h-64 md:h-72 min-h-[200px]">
                       <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                          <BarChart data={[{ name: 'Total Tangkapan', NodeA: nodeA.uv365, NodeB: nodeB.uv395 }]}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                              <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} />
                              <YAxis stroke="#9ca3af" fontSize={12} />
                              <Tooltip contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: 'white' }} cursor={{fill: 'rgba(255,255,255,0.05)'}}/>
                              <Legend />
                              <Bar dataKey="NodeA" name="UV 365 nm" fill="#8b5cf6" radius={[6,6,0,0]} barSize={40} />
                              <Bar dataKey="NodeB" name="UV 395 nm" fill="#3b82f6" radius={[6,6,0,0]} barSize={40} />
                          </BarChart>
                       </ResponsiveContainer>
                   </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6" id="log-section">
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 md:p-5 lg:col-span-2 shadow-sm">
                   <div className="flex justify-between items-center mb-4">
                       <h3 className="text-base md:text-lg font-bold text-gray-800 dark:text-white">Log Deteksi Sensor (Real-time)</h3>
                       <div className="flex gap-2 items-center">
                           <button onClick={handleDownloadExcel} className="px-3 py-1.5 flex items-center gap-1.5 rounded-lg text-emerald-700 bg-emerald-100 hover:bg-emerald-200 dark:text-emerald-300 dark:bg-emerald-900/40 dark:hover:bg-emerald-900/60 transition-colors text-sm font-semibold" title="Unduh Database Lengkap (Excel)">
                              <Download className="w-4 h-4"/>
                              <span className="hidden sm:inline">Unduh Excel</span>
                           </button>
                           <button onClick={generateLogsSync} className="p-1.5 rounded-lg text-emerald-600 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 transition-colors" title="Sinkronisasi Log">
                              <RotateCcw className="w-5 h-5"/>
                           </button>
                       </div>
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
                               {logs.length === 0 ? (
                                   <tr>
                                       <td colSpan={3} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">
                                           <SatelliteDish className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                                           Menunggu koneksi dan data masuk...
                                       </td>
                                   </tr>
                               ) : logs.map((log) => (
                                   <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                       <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-200">{new Date(log.timestamp).toLocaleTimeString('id-ID')}</td>
                                       <td className="px-4 py-3 dark:text-gray-300">{log.source}</td>
                                       <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-4 h-4"/> {log.action || 'IR Terpicu (+1)'}</td>
                                   </tr>
                               ))}
                           </tbody>
                       </table>
                   </div>
                </div>

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
                          <div className="flex items-center bg-emerald-50 dark:bg-emerald-900/30 rounded-lg p-1.5 border border-emerald-200 dark:border-emerald-800 cursor-pointer w-full" onClick={() => setIsDemoMode(!isDemoMode)}>
                              <div className={cn("flex-1 text-center py-2.5 text-xs sm:text-sm font-bold rounded-md transition-all", isDemoMode ? "bg-white dark:bg-emerald-700 shadow-sm text-emerald-700 dark:text-white" : "text-emerald-600 dark:text-emerald-400")}>
                                  DATA DEMO
                              </div>
                              <div className={cn("flex-1 text-center py-2.5 text-xs sm:text-sm font-bold rounded-md transition-all", !isDemoMode ? "bg-white dark:bg-emerald-700 shadow-sm text-emerald-700 dark:text-white" : "text-emerald-600 dark:text-emerald-400")}>
                                  DATA ASLI
                              </div>
                          </div>
                           {!user && !isDemoMode && (
                              <p className="text-[11px] text-red-500 dark:text-red-400 mt-2 text-center">Harap Login untuk mengakses data asli.</p>
                           )}
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2 text-center">Gunakan mode demo untuk keperluan presentasi.</p>
                      </div>
                      <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Tema Tampilan</label>
                          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1.5 border border-gray-200 dark:border-gray-700 w-full justify-between gap-1">
                              {['light', 'system', 'dark'].map((t) => (
                                  <button key={t} onClick={() => setTheme(t as any)} className={cn("flex-1 py-2 rounded-md flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 transition-colors text-xs font-medium capitalize", theme === t ? "bg-white dark:bg-gray-600 shadow-sm text-emerald-600 dark:text-emerald-400" : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-300")}>
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

      {/* Profile Modal */}
      {isProfileOpen && user && (
          <div className="fixed inset-0 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center transition-opacity" onClick={(e) => {
              if(e.target === e.currentTarget) {
                 setProfileOpen(false);
                 setIsEditingProfile(false);
              }
          }}>
              <div className="bg-white dark:bg-gray-800 w-[90%] max-w-sm rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden transform scale-100 transition-transform">
                  
                  {isEditingProfile ? (
                     <div className="p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-lg text-gray-900 dark:text-white">Edit Profil</h3>
                            <button onClick={() => setIsEditingProfile(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                               <X className="w-5 h-5"/>
                            </button>
                        </div>
                        <div className="space-y-4">
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
                              <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} alt="avatar" className="w-20 h-20 rounded-full object-cover bg-white dark:bg-gray-800" />
                          </div>
                      </div>
                      <div className="pt-14 pb-6 px-6 text-center">
                          <h3 className="font-bold text-xl text-gray-900 dark:text-white">{user.displayName || "User"}</h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{user.email}</p>
                          
                          <div className="space-y-3">
                              <button onClick={() => { signOut(auth); setProfileOpen(false); }} className="w-full py-2.5 bg-gray-50 text-gray-700 hover:bg-red-50 hover:text-red-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-red-900/30 dark:hover:text-red-400 border border-gray-200 dark:border-gray-600 dark:hover:border-red-900/50 hover:border-red-200 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                                  Logout
                              </button>
                          </div>
                      </div>
                    </>
                  )}
              </div>
          </div>
      )}

      {/* Notifications Toast */}
      {notifications.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[90] flex flex-col gap-2">
          {notifications.map(n => (
            <div key={n.id} className="bg-red-600 border border-red-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-pulse">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm font-medium">{n.text}</p>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

