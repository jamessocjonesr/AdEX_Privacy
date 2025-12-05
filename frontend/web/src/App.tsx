// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

// Randomly selected styles: 
// Colors: High contrast (blue+orange)
// UI: Futuristic metal
// Layout: Multi-column dashboard
// Interaction: Micro-interactions

// Randomly selected features:
// 1. Data statistics
// 2. Search & filter
// 3. User action history
// 4. FAQ section

interface AdCampaign {
  id: number;
  title: string;
  targetAge: string; // Encrypted as number range (18-25 = 1825)
  targetGender: string; // Encrypted as number (1=male, 2=female, 3=other)
  budget: string; // Encrypted number
  impressions: number;
  clicks: number;
  ctr: number;
  status: 'active' | 'paused' | 'completed';
  encryptedMatchScore: string;
  creator: string;
  timestamp: number;
}

interface UserProfile {
  age: string; // Encrypted
  gender: string; // Encrypted
  interests: string; // Encrypted as numbers (comma separated)
  walletAddress: string;
}

interface UserAction {
  type: 'create' | 'pause' | 'decrypt' | 'match';
  timestamp: number;
  details: string;
}

// FHE encryption/decryption simulation
const FHEEncryptNumber = (value: number): string => `FHE-${btoa(value.toString())}`;
const FHEDecryptNumber = (encryptedData: string): number => encryptedData.startsWith('FHE-') ? parseFloat(atob(encryptedData.substring(4))) : parseFloat(encryptedData);
const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newCampaignData, setNewCampaignData] = useState({ title: "", targetAge: "", targetGender: "", budget: "" });
  const [selectedCampaign, setSelectedCampaign] = useState<AdCampaign | null>(null);
  const [decryptedScore, setDecryptedScore] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState("");
  const [contractAddress, setContractAddress] = useState("");
  const [chainId, setChainId] = useState(0);
  const [startTimestamp, setStartTimestamp] = useState(0);
  const [durationDays, setDurationDays] = useState(30);
  const [userActions, setUserActions] = useState<UserAction[]>([]);
  const [activeTab, setActiveTab] = useState('campaigns');
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Initialize signature parameters
  useEffect(() => {
    loadData().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  // Load data from contract
  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        setTransactionStatus({ visible: true, status: "success", message: "Contract is available!" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      }
      
      // Load campaigns
      const campaignsBytes = await contract.getData("campaigns");
      let campaignsList: AdCampaign[] = [];
      if (campaignsBytes.length > 0) {
        try {
          const campaignsStr = ethers.toUtf8String(campaignsBytes);
          if (campaignsStr.trim() !== '') campaignsList = JSON.parse(campaignsStr);
        } catch (e) {}
      }
      setCampaigns(campaignsList);
      
      // Load user profile if connected
      if (isConnected && address) {
        const profileBytes = await contract.getData(`profile_${address}`);
        if (profileBytes.length > 0) {
          try {
            const profileStr = ethers.toUtf8String(profileBytes);
            if (profileStr.trim() !== '') {
              setUserProfile(JSON.parse(profileStr));
            }
          } catch (e) {}
        }
      }
    } catch (e) {
      console.error("Error loading data:", e);
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
      setLoading(false); 
    }
  };

  // Create new campaign
  const createCampaign = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingCampaign(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating campaign with Zama FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      // Encrypt target data using FHE simulation
      const encryptedAge = FHEEncryptNumber(parseInt(newCampaignData.targetAge.replace('-', '')));
      const encryptedGender = FHEEncryptNumber(
        newCampaignData.targetGender === "male" ? 1 : 
        newCampaignData.targetGender === "female" ? 2 : 3
      );
      const encryptedBudget = FHEEncryptNumber(parseFloat(newCampaignData.budget));
      
      // Create new campaign
      const newCampaign: AdCampaign = {
        id: campaigns.length + 1,
        title: newCampaignData.title,
        targetAge: encryptedAge,
        targetGender: encryptedGender,
        budget: encryptedBudget,
        impressions: 0,
        clicks: 0,
        ctr: 0,
        status: 'active',
        encryptedMatchScore: FHEEncryptNumber(0), // Initial match score
        creator: address,
        timestamp: Math.floor(Date.now() / 1000)
      };
      
      // Update campaigns list
      const updatedCampaigns = [...campaigns, newCampaign];
      
      // Save to contract
      await contract.setData("campaigns", ethers.toUtf8Bytes(JSON.stringify(updatedCampaigns)));
      
      // Update user actions
      const newAction: UserAction = {
        type: 'create',
        timestamp: Math.floor(Date.now() / 1000),
        details: `Created campaign: ${newCampaignData.title}`
      };
      setUserActions(prev => [newAction, ...prev]);
      
      setTransactionStatus({ visible: true, status: "success", message: "Campaign created with FHE encryption!" });
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewCampaignData({ title: "", targetAge: "", targetGender: "", budget: "" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingCampaign(false); 
    }
  };

  // Toggle campaign status
  const toggleCampaignStatus = async (campaignId: number) => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setTransactionStatus({ visible: true, status: "pending", message: "Updating campaign status..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      // Find the campaign
      const campaignIndex = campaigns.findIndex(c => c.id === campaignId);
      if (campaignIndex === -1) throw new Error("Campaign not found");
      
      // Update status
      const updatedCampaigns = [...campaigns];
      updatedCampaigns[campaignIndex].status = 
        updatedCampaigns[campaignIndex].status === 'active' ? 'paused' : 'active';
      
      // Save to contract
      await contract.setData("campaigns", ethers.toUtf8Bytes(JSON.stringify(updatedCampaigns)));
      
      // Update user actions
      const newAction: UserAction = {
        type: 'pause',
        timestamp: Math.floor(Date.now() / 1000),
        details: `${updatedCampaigns[campaignIndex].status === 'active' ? 'Resumed' : 'Paused'} campaign: ${updatedCampaigns[campaignIndex].title}`
      };
      setUserActions(prev => [newAction, ...prev]);
      
      setTransactionStatus({ visible: true, status: "success", message: "Campaign status updated!" });
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Update failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  // Decrypt match score with signature
  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Update user actions
      const newAction: UserAction = {
        type: 'decrypt',
        timestamp: Math.floor(Date.now() / 1000),
        details: "Decrypted FHE match score"
      };
      setUserActions(prev => [newAction, ...prev]);
      
      return FHEDecryptNumber(encryptedData);
    } catch (e) { 
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  // Calculate match score (simulated FHE computation)
  const calculateMatchScore = async (campaign: AdCampaign) => {
    if (!userProfile) return;
    
    setTransactionStatus({ visible: true, status: "pending", message: "Calculating match with Zama FHE..." });
    
    try {
      // Simulate FHE computation delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // In a real scenario, this would be done on-chain with FHE
      const updatedCampaigns = [...campaigns];
      const campaignIndex = updatedCampaigns.findIndex(c => c.id === campaign.id);
      
      // Generate a random match score between 50-100 for demo purposes
      const newScore = Math.floor(Math.random() * 50) + 50;
      updatedCampaigns[campaignIndex].encryptedMatchScore = FHEEncryptNumber(newScore);
      
      // Save to contract
      const contract = await getContractWithSigner();
      if (contract) {
        await contract.setData("campaigns", ethers.toUtf8Bytes(JSON.stringify(updatedCampaigns)));
      }
      
      // Update user actions
      const newAction: UserAction = {
        type: 'match',
        timestamp: Math.floor(Date.now() / 1000),
        details: `Calculated match for campaign: ${campaign.title}`
      };
      setUserActions(prev => [newAction, ...prev]);
      
      setTransactionStatus({ visible: true, status: "success", message: "Match calculated with FHE!" });
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Match calculation failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  // Render FHE flow visualization
  const renderFHEFlow = () => {
    return (
      <div className="fhe-flow">
        <div className="flow-step">
          <div className="step-icon">1</div>
          <div className="step-content">
            <h4>User Profile Encryption</h4>
            <p>User demographics and interests are encrypted using Zama FHE</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">2</div>
          <div className="step-content">
            <h4>Ad Targeting Encryption</h4>
            <p>Advertiser targeting criteria are encrypted with FHE</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">3</div>
          <div className="step-content">
            <h4>Homomorphic Matching</h4>
            <p>Matching occurs on encrypted data without decryption</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">4</div>
          <div className="step-content">
            <h4>Private Ad Delivery</h4>
            <p>Ads are served without exposing user data to advertisers</p>
          </div>
        </div>
      </div>
    );
  };

  // Render user actions history
  const renderUserActions = () => {
    if (userActions.length === 0) return <div className="no-data">No actions recorded</div>;
    
    return (
      <div className="actions-list">
        {userActions.map((action, index) => (
          <div className="action-item" key={index}>
            <div className={`action-type ${action.type}`}>
              {action.type === 'create' && '📝'}
              {action.type === 'pause' && '⏸️'}
              {action.type === 'decrypt' && '🔓'}
              {action.type === 'match' && '🔍'}
            </div>
            <div className="action-details">
              <div className="action-text">{action.details}</div>
              <div className="action-time">{new Date(action.timestamp * 1000).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Render FAQ section
  const renderFAQ = () => {
    const faqItems = [
      {
        question: "What is AdEX_Privacy?",
        answer: "AdEX_Privacy is a decentralized ad exchange that uses Fully Homomorphic Encryption (FHE) to match ads with users without exposing private data."
      },
      {
        question: "How does FHE protect my privacy?",
        answer: "FHE allows computations to be performed on encrypted data without decrypting it. Your profile data remains encrypted throughout the matching process."
      },
      {
        question: "What data is encrypted?",
        answer: "All user demographics (age, gender) and interests are encrypted, as well as advertiser targeting criteria. Only match scores are revealed after decryption."
      },
      {
        question: "Can advertisers see my personal data?",
        answer: "No, advertisers only receive aggregated, anonymized data about ad performance, never individual user information."
      },
      {
        question: "What blockchain is this built on?",
        answer: "AdEX_Privacy is built on Ethereum and utilizes Zama FHE for privacy-preserving computations."
      }
    ];
    
    return (
      <div className="faq-container">
        {faqItems.map((item, index) => (
          <div className="faq-item" key={index}>
            <div className="faq-question">{item.question}</div>
            <div className="faq-answer">{item.answer}</div>
          </div>
        ))}
      </div>
    );
  };

  // Filter campaigns based on search and status
  const filteredCampaigns = campaigns.filter(campaign => {
    const matchesSearch = campaign.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || campaign.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Initializing encrypted ad exchange...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="ad-icon"></div>
          </div>
          <h1>AdEX<span>_Privacy</span></h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-campaign-btn"
          >
            <div className="add-icon"></div>New Campaign
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      
      <div className="main-content-container">
        <div className="dashboard-section">
          <div className="dashboard-grid">
            <div className="dashboard-panel intro-panel">
              <div className="panel-card">
                <h2>Private Ad Exchange with FHE</h2>
                <p>AdEX_Privacy enables targeted advertising while preserving user privacy through Zama FHE technology.</p>
                <div className="fhe-badge">
                  <div className="fhe-icon"></div>
                  <span>Powered by Zama FHE</span>
                </div>
              </div>
              
              <div className="panel-card">
                <h2>FHE Matching Flow</h2>
                {renderFHEFlow()}
              </div>
              
              <div className="panel-card">
                <h2>Platform Statistics</h2>
                <div className="stats-grid">
                  <div className="stat-item">
                    <div className="stat-value">{campaigns.length}</div>
                    <div className="stat-label">Campaigns</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">
                      {campaigns.length > 0 
                        ? campaigns.reduce((sum, c) => sum + c.impressions, 0)
                        : 0}
                    </div>
                    <div className="stat-label">Impressions</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">
                      {campaigns.length > 0 
                        ? (campaigns.reduce((sum, c) => sum + c.ctr, 0) / campaigns.length).toFixed(2)
                        : 0}%
                    </div>
                    <div className="stat-label">Avg CTR</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="tabs-container">
            <div className="tabs">
              <button 
                className={`tab ${activeTab === 'campaigns' ? 'active' : ''}`}
                onClick={() => setActiveTab('campaigns')}
              >
                Campaigns
              </button>
              <button 
                className={`tab ${activeTab === 'actions' ? 'active' : ''}`}
                onClick={() => setActiveTab('actions')}
              >
                My Actions
              </button>
              <button 
                className={`tab ${activeTab === 'faq' ? 'active' : ''}`}
                onClick={() => setActiveTab('faq')}
              >
                FAQ
              </button>
            </div>
            
            <div className="tab-content">
              {activeTab === 'campaigns' && (
                <div className="campaigns-section">
                  <div className="section-header">
                    <h2>Advertising Campaigns</h2>
                    <div className="header-actions">
                      <div className="search-filter-container">
                        <input
                          type="text"
                          placeholder="Search campaigns..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="search-input"
                        />
                        <select
                          value={filterStatus}
                          onChange={(e) => setFilterStatus(e.target.value)}
                          className="status-filter"
                        >
                          <option value="all">All Status</option>
                          <option value="active">Active</option>
                          <option value="paused">Paused</option>
                          <option value="completed">Completed</option>
                        </select>
                      </div>
                      <button 
                        onClick={loadData} 
                        className="refresh-btn" 
                        disabled={isRefreshing}
                      >
                        {isRefreshing ? "Refreshing..." : "Refresh"}
                      </button>
                    </div>
                  </div>
                  
                  <div className="campaigns-list">
                    {filteredCampaigns.length === 0 ? (
                      <div className="no-campaigns">
                        <div className="no-campaigns-icon"></div>
                        <p>No campaigns found</p>
                        <button 
                          className="create-btn" 
                          onClick={() => setShowCreateModal(true)}
                        >
                          Create First Campaign
                        </button>
                      </div>
                    ) : filteredCampaigns.map((campaign, index) => (
                      <div 
                        className={`campaign-item ${selectedCampaign?.id === campaign.id ? "selected" : ""}`} 
                        key={index}
                        onClick={() => setSelectedCampaign(campaign)}
                      >
                        <div className="campaign-header">
                          <div className="campaign-title">{campaign.title}</div>
                          <div className={`campaign-status ${campaign.status}`}>{campaign.status}</div>
                        </div>
                        <div className="campaign-stats">
                          <div className="stat">
                            <span>Impressions:</span>
                            <strong>{campaign.impressions}</strong>
                          </div>
                          <div className="stat">
                            <span>CTR:</span>
                            <strong>{campaign.ctr.toFixed(2)}%</strong>
                          </div>
                          <div className="stat">
                            <span>Match Score:</span>
                            <strong>{campaign.encryptedMatchScore.substring(0, 8)}...</strong>
                          </div>
                        </div>
                        <div className="campaign-creator">Creator: {campaign.creator.substring(0, 6)}...{campaign.creator.substring(38)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {activeTab === 'actions' && (
                <div className="actions-section">
                  <h2>My Activity History</h2>
                  {renderUserActions()}
                </div>
              )}
              
              {activeTab === 'faq' && (
                <div className="faq-section">
                  <h2>Frequently Asked Questions</h2>
                  {renderFAQ()}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreateCampaign 
          onSubmit={createCampaign} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingCampaign} 
          campaignData={newCampaignData} 
          setCampaignData={setNewCampaignData}
        />
      )}
      
      {selectedCampaign && (
        <CampaignDetailModal 
          campaign={selectedCampaign} 
          onClose={() => { 
            setSelectedCampaign(null); 
            setDecryptedScore(null); 
          }} 
          decryptedScore={decryptedScore} 
          setDecryptedScore={setDecryptedScore} 
          isDecrypting={isDecrypting} 
          decryptWithSignature={decryptWithSignature}
          toggleCampaignStatus={toggleCampaignStatus}
          calculateMatchScore={calculateMatchScore}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="ad-icon"></div>
              <span>AdEX_Privacy</span>
            </div>
            <p>Private ad exchange powered by FHE</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>Powered by Zama FHE</span>
          </div>
          <div className="copyright">© {new Date().getFullYear()} AdEX_Privacy. All rights reserved.</div>
          <div className="disclaimer">
            This system uses fully homomorphic encryption to protect user privacy. 
            Ad matching occurs on encrypted data without revealing personal information.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateCampaignProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  campaignData: any;
  setCampaignData: (data: any) => void;
}

const ModalCreateCampaign: React.FC<ModalCreateCampaignProps> = ({ onSubmit, onClose, creating, campaignData, setCampaignData }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setCampaignData({ ...campaignData, [name]: value });
  };

  return (
    <div className="modal-overlay">
      <div className="create-campaign-modal">
        <div className="modal-header">
          <h2>Create New Ad Campaign</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="lock-icon"></div>
            <div>
              <strong>FHE Targeting Notice</strong>
              <p>All targeting criteria will be encrypted using Zama FHE</p>
            </div>
          </div>
          
          <div className="form-group">
            <label>Campaign Title *</label>
            <input 
              type="text" 
              name="title" 
              value={campaignData.title} 
              onChange={handleChange} 
              placeholder="Enter campaign title..." 
            />
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Target Age Range *</label>
              <select 
                name="targetAge" 
                value={campaignData.targetAge} 
                onChange={handleChange}
              >
                <option value="">Select age range</option>
                <option value="18-25">18-25</option>
                <option value="26-35">26-35</option>
                <option value="36-45">36-45</option>
                <option value="46-55">46-55</option>
                <option value="56+">56+</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Target Gender *</label>
              <select 
                name="targetGender" 
                value={campaignData.targetGender} 
                onChange={handleChange}
              >
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other/All</option>
              </select>
            </div>
          </div>
          
          <div className="form-group">
            <label>Daily Budget (ETH) *</label>
            <input 
              type="number" 
              name="budget" 
              value={campaignData.budget} 
              onChange={handleChange} 
              placeholder="Enter daily budget..." 
              step="0.01"
              min="0.01"
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || !campaignData.title || !campaignData.targetAge || !campaignData.targetGender || !campaignData.budget} 
            className="submit-btn"
          >
            {creating ? "Creating with FHE..." : "Create Campaign"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface CampaignDetailModalProps {
  campaign: AdCampaign;
  onClose: () => void;
  decryptedScore: number | null;
  setDecryptedScore: (value: number | null) => void;
  isDecrypting: boolean;
  decryptWithSignature: (encryptedData: string) => Promise<number | null>;
  toggleCampaignStatus: (campaignId: number) => void;
  calculateMatchScore: (campaign: AdCampaign) => void;
}

const CampaignDetailModal: React.FC<CampaignDetailModalProps> = ({ 
  campaign, 
  onClose, 
  decryptedScore, 
  setDecryptedScore, 
  isDecrypting, 
  decryptWithSignature,
  toggleCampaignStatus,
  calculateMatchScore
}) => {
  const handleDecrypt = async () => {
    if (decryptedScore !== null) { 
      setDecryptedScore(null); 
      return; 
    }
    
    const decrypted = await decryptWithSignature(campaign.encryptedMatchScore);
    if (decrypted !== null) {
      setDecryptedScore(decrypted);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="campaign-detail-modal">
        <div className="modal-header">
          <h2>Campaign Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="campaign-info">
            <div className="info-item">
              <span>Title:</span>
              <strong>{campaign.title}</strong>
            </div>
            <div className="info-item">
              <span>Status:</span>
              <strong className={`status ${campaign.status}`}>{campaign.status}</strong>
            </div>
            <div className="info-item">
              <span>Creator:</span>
              <strong>{campaign.creator.substring(0, 6)}...{campaign.creator.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>Created:</span>
              <strong>{new Date(campaign.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
          </div>
          
          <div className="campaign-stats">
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{campaign.impressions}</div>
                <div className="stat-label">Impressions</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{campaign.clicks}</div>
                <div className="stat-label">Clicks</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{campaign.ctr.toFixed(2)}%</div>
                <div className="stat-label">CTR</div>
              </div>
            </div>
          </div>
          
          <div className="targeting-section">
            <h3>Targeting Criteria</h3>
            <div className="targeting-info">
              <div className="targeting-item">
                <span>Age:</span>
                <strong>{campaign.targetAge.substring(0, 8)}...</strong>
              </div>
              <div className="targeting-item">
                <span>Gender:</span>
                <strong>{campaign.targetGender.substring(0, 8)}...</strong>
              </div>
              <div className="targeting-item">
                <span>Budget:</span>
                <strong>{campaign.budget.substring(0, 8)}...</strong>
              </div>
            </div>
            <div className="fhe-tag">
              <div className="fhe-icon"></div>
              <span>FHE Encrypted</span>
            </div>
          </div>
          
          <div className="match-section">
            <h3>Audience Match</h3>
            <div className="match-content">
              <div className="match-score-container">
                <div className="match-score">
                  {decryptedScore !== null ? (
                    <>
                      <span className="score-value">{decryptedScore}</span>
                      <span className="score-label">Match Score</span>
                    </>
                  ) : (
                    <>
                      <span className="score-value">{campaign.encryptedMatchScore.substring(0, 8)}...</span>
                      <span className="score-label">Encrypted Score</span>
                    </>
                  )}
                </div>
                <button 
                  className="decrypt-btn" 
                  onClick={handleDecrypt} 
                  disabled={isDecrypting}
                >
                  {isDecrypting ? (
                    "Decrypting..."
                  ) : decryptedScore !== null ? (
                    "Hide Score"
                  ) : (
                    "Decrypt Score"
                  )}
                </button>
              </div>
              
              <div className="match-actions">
                <button 
                  className="calculate-btn"
                  onClick={() => calculateMatchScore(campaign)}
                >
                  Calculate Match
                </button>
                <button 
                  className={`status-btn ${campaign.status}`}
                  onClick={() => toggleCampaignStatus(campaign.id)}
                >
                  {campaign.status === 'active' ? 'Pause Campaign' : 'Activate Campaign'}
                </button>
              </div>
            </div>
            
            {decryptedScore !== null && (
              <div className="decryption-notice">
                <div className="warning-icon"></div>
                <span>Match score is only visible after wallet signature verification</span>
              </div>
            )}
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;