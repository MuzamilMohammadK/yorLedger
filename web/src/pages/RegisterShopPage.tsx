import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { INDIAN_STATES, validateGSTIN, normalizePhone } from '@yorbalance/shared';
import {
  Store,
  User as UserIcon,
  FileText,
  Phone,
  Mail,
  MapPin,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  Sparkles,
  UploadCloud,
  Image as ImageIcon,
  X,
  AlertCircle
} from 'lucide-react';

// Sample tiny JPEG base64 image data URI for test merchant auto-fill
const SAMPLE_JPEG_DATA_URI = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

export const RegisterShopPage: React.FC = () => {
  const [formData, setFormData] = useState({
    shop_name: '',
    owner_name: '',
    gstin: '',
    mobile: '',
    email: '',
    address: '',
    state_code: '29', // Default Karnataka (major silk saree hub)
    default_gst_bp: '500', // 500 = 5% (Standard for Silk Sarees)
    password: '',
    confirm_password: ''
  });

  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [gstinMessage, setGstinMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { registerShop, user, shop } = useAuth();
  const navigate = useNavigate();

  // Redirect if already authenticated
  useEffect(() => {
    if (user && shop) {
      if (shop.status === 'APPROVED') {
        navigate('/dashboard');
      } else {
        navigate('/pending-approval');
      }
    }
  }, [user, shop, navigate]);

  // Live GSTIN check & auto-state derivation
  const handleGstinChange = (value: string) => {
    const uppercase = value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15);
    setFormData(prev => ({ ...prev, gstin: uppercase }));

    if (uppercase.length === 15) {
      const res = validateGSTIN(uppercase, true);
      if (res.valid) {
        setGstinMessage({ text: `Valid GSTIN: ${res.stateName}`, isError: false });
        if (res.stateCode) {
          setFormData(prev => ({ ...prev, state_code: res.stateCode! }));
        }
        setErrors(prev => ({ ...prev, gstin: '' }));
      } else {
        setGstinMessage({ text: res.error || 'Invalid GSTIN', isError: true });
        setErrors(prev => ({ ...prev, gstin: res.error || 'Invalid GSTIN' }));
      }
    } else {
      setGstinMessage(null);
    }
  };

  const handleDocumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDocumentError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Strict JPEG/JPG format validation
    const isJpeg = file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name);
    if (!isJpeg) {
      setDocumentError('Invalid file type! Shop verification document must be strictly in JPEG or JPG format.');
      setDocumentUrl(null);
      setDocumentName(null);
      return;
    }

    // Size limit: 5 MB
    if (file.size > 5 * 1024 * 1024) {
      setDocumentError('Document file size must not exceed 5 MB.');
      return;
    }

    setDocumentName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setDocumentUrl(reader.result as string);
      setErrors(prev => ({ ...prev, document: '' }));
    };
    reader.onerror = () => {
      setDocumentError('Failed to read the selected file. Please try again.');
    };
    reader.readAsDataURL(file);
  };

  const removeDocument = () => {
    setDocumentUrl(null);
    setDocumentName(null);
    setDocumentError(null);
  };

  const validateForm = (): boolean => {
    const errs: Record<string, string> = {};

    if (!formData.shop_name.trim()) errs.shop_name = 'Shop name is required';
    if (!formData.owner_name.trim()) errs.owner_name = 'Owner name is required';

    if (!formData.email.trim() || !/^\S+@\S+\.\S+$/.test(formData.email)) {
      errs.email = 'Valid business email is required';
    }

    const normalizedMobile = normalizePhone(formData.mobile);
    if (!normalizedMobile) {
      errs.mobile = 'Enter a valid 10-digit Indian mobile number';
    }

    const gstinRes = validateGSTIN(formData.gstin, true);
    if (!gstinRes.valid) {
      errs.gstin = gstinRes.error || 'Invalid GSTIN format or checksum';
    } else if (gstinRes.stateCode !== formData.state_code) {
      errs.state_code = 'Selected state does not match GSTIN state prefix';
    }

    if (!formData.address.trim()) errs.address = 'Full shop address is required';

    if (!documentUrl) {
      errs.document = 'Please upload a shop document (GST/Trade license) in JPEG/JPG format for admin verification';
    }

    if (!formData.password || formData.password.length < 8) {
      errs.password = 'Password must be at least 8 characters';
    }

    if (formData.password !== formData.confirm_password) {
      errs.confirm_password = 'Passwords do not match';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      setIsLoading(true);
      await registerShop(formData.email.trim(), formData.password, {
        shop_name: formData.shop_name.trim(),
        owner_name: formData.owner_name.trim(),
        gstin: formData.gstin.trim().toUpperCase(),
        mobile: formData.mobile.trim(),
        address: formData.address.trim(),
        state_code: formData.state_code,
        default_gst_bp: parseInt(formData.default_gst_bp, 10),
        document_url: documentUrl,
        document_name: documentName
      });

      // Navigation to "Waiting for Admin Approval" screen
      navigate('/pending-approval');
    } catch (err: any) {
      console.error(err);
      if (err.fields) {
        setErrors(err.fields);
      } else {
        setErrors({ form: err.message || 'Registration failed. Please review your details.' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to fill sample authentic data for testing convenience
  const fillSampleData = () => {
    setFormData({
      shop_name: 'Sri Lakshmi Silks & Sarees',
      owner_name: 'Ramesh Sundaram',
      gstin: '29AAAAA0000A1Z5',
      mobile: '9845012345',
      email: 'ramesh@srilakshmisilks.com',
      address: 'Shop #42, Avenue Road, Chickpet, Bengaluru',
      state_code: '29',
      default_gst_bp: '500',
      password: 'Password@123',
      confirm_password: 'Password@123'
    });
    setDocumentUrl(SAMPLE_JPEG_DATA_URI);
    setDocumentName('GST_Certificate_SriLakshmiSilks.jpg');
    setDocumentError(null);
    handleGstinChange('29AAAAA0000A1Z5');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50/40 via-slate-50 to-rose-50/30 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-brand-900 flex items-center justify-center text-amber-400 shadow-lg shadow-brand-950/20 mb-3">
            <Sparkles className="w-6 h-6" />
          </div>
          <h1 className="font-serif-display text-3xl font-extrabold text-slate-900">
            Register Your Saree & Silk Business
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 max-w-lg mx-auto">
            Create an official merchant account for your enterprise. Upload your verification documents for admin review to activate your digital ledger.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-100 p-6 sm:p-10">
          <div className="flex items-center justify-between pb-6 mb-6 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Shop Registration Application</h2>
              <p className="text-sm text-slate-500">Provide official business details and JPEG verification documents</p>
            </div>
            <button
              type="button"
              onClick={fillSampleData}
              className="text-sm font-semibold px-3 py-1.5 bg-amber-50 text-amber-900 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
            >
              Fill Sample Merchant
            </button>
          </div>

          {errors.form && (
            <Alert type="error" message={errors.form} className="mb-6" />
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Section 1: Business Identity */}
            <div>
              <h3 className="text-sm font-bold text-brand-900 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                <Store className="w-4 h-4" /> 1. Business Profile
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Shop / Business Name"
                  placeholder="e.g. Sri Lakshmi Silks"
                  value={formData.shop_name}
                  onChange={e => setFormData({ ...formData, shop_name: e.target.value })}
                  error={errors.shop_name}
                  leftIcon={<Store className="w-4 h-4" />}
                  required
                />

                <Input
                  label="Proprietor / Owner Name"
                  placeholder="e.g. Ramesh Sundaram"
                  value={formData.owner_name}
                  onChange={e => setFormData({ ...formData, owner_name: e.target.value })}
                  error={errors.owner_name}
                  leftIcon={<UserIcon className="w-4 h-4" />}
                  required
                />
              </div>
            </div>

            {/* Section 2: Taxation & Location */}
            <div className="pt-4 border-t border-slate-100">
              <h3 className="text-sm font-bold text-brand-900 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                <FileText className="w-4 h-4" /> 2. GST & Tax Settings
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Input
                    label="GSTIN (15 Alphanumeric)"
                    placeholder="e.g. 29AAAAA0000A1Z5"
                    value={formData.gstin}
                    onChange={e => handleGstinChange(e.target.value)}
                    error={errors.gstin}
                    maxLength={15}
                    leftIcon={<FileText className="w-4 h-4" />}
                    required
                  />
                  {gstinMessage && (
                    <p className={`mt-1 text-sm font-medium flex items-center gap-1 ${gstinMessage.isError ? 'text-rose-600' : 'text-emerald-700'}`}>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {gstinMessage.text}
                    </p>
                  )}
                </div>

                <Select
                  label="Registered State"
                  value={formData.state_code}
                  onChange={e => setFormData({ ...formData, state_code: e.target.value })}
                  error={errors.state_code}
                  options={INDIAN_STATES.map(s => ({
                    value: s.code,
                    label: `${s.code} - ${s.name}`
                  }))}
                />

                <Select
                  label="Default GST Rate"
                  value={formData.default_gst_bp}
                  onChange={e => setFormData({ ...formData, default_gst_bp: e.target.value })}
                  helperText="5% is the standard rate for raw silk, sarees and handloom textiles"
                  options={[
                    { value: '500', label: '5% (Silk Sarees & Fabrics Standard)' },
                    { value: '1200', label: '12% (Processed Ready-mades)' },
                    { value: '1800', label: '18% (Accessories & Mixed)' },
                    { value: '2800', label: '28% (Luxury items)' }
                  ]}
                />

                <Input
                  label="Full Shop Address"
                  placeholder="Door/Shop No, Street, Market, City, Pincode"
                  value={formData.address}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                  error={errors.address}
                  leftIcon={<MapPin className="w-4 h-4" />}
                  required
                />
              </div>
            </div>

            {/* Section 3: Document Verification (JPEG/JPG required) */}
            <div className="pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-brand-900 uppercase tracking-wider flex items-center gap-1.5">
                  <UploadCloud className="w-4 h-4" /> 3. Shop Verification Document (JPEG/JPG Format)
                </h3>
                <span className="text-sm font-semibold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                  Required Format: .JPG / .JPEG
                </span>
              </div>
              <p className="text-sm text-slate-500 mb-3">
                Upload your official GST Certificate, Shop Establishment License, or Business Registration Proof.
              </p>

              {documentError && (
                <div className="mb-3 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{documentError}</span>
                </div>
              )}

              {errors.document && (
                <div className="mb-3 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{errors.document}</span>
                </div>
              )}

              {!documentUrl ? (
                <div className="border-2 border-dashed border-slate-300 hover:border-brand-800 transition-colors rounded-2xl p-6 text-center bg-slate-50/50">
                  <input
                    type="file"
                    id="shop-document-input"
                    accept=".jpg,.jpeg,image/jpeg"
                    onChange={handleDocumentChange}
                    className="hidden"
                  />
                  <label htmlFor="shop-document-input" className="cursor-pointer block">
                    <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center mx-auto mb-3">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                    <span className="text-sm font-bold text-slate-800 block mb-1">
                      Click to upload shop document in JPEG/JPG format
                    </span>
                    <span className="text-sm text-slate-500 block">
                      Supported extensions: .jpg, .jpeg (Maximum size: 5 MB)
                    </span>
                  </label>
                </div>
              ) : (
                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-14 h-14 rounded-xl border border-slate-300 bg-white overflow-hidden flex items-center justify-center flex-shrink-0">
                      <img
                        src={documentUrl}
                        alt="Uploaded Document"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="overflow-hidden">
                      <span className="text-sm font-bold text-slate-900 block truncate">
                        {documentName || 'Shop_Document.jpg'}
                      </span>
                      <span className="text-sm font-semibold text-emerald-700 flex items-center gap-1 mt-0.5">
                        <CheckCircle2 className="w-3.5 h-3.5" /> JPEG Format Verified
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="shop-document-replace"
                      className="cursor-pointer text-sm font-semibold px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      Change
                    </label>
                    <input
                      type="file"
                      id="shop-document-replace"
                      accept=".jpg,.jpeg,image/jpeg"
                      onChange={handleDocumentChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={removeDocument}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                      title="Remove document"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Section 4: Contact & Access */}
            <div className="pt-4 border-t border-slate-100">
              <h3 className="text-sm font-bold text-brand-900 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                <Lock className="w-4 h-4" /> 4. Contact & Login Credentials
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Mobile Number (Primary)"
                  placeholder="10-digit mobile number"
                  value={formData.mobile}
                  onChange={e => setFormData({ ...formData, mobile: e.target.value })}
                  error={errors.mobile}
                  leftIcon={<Phone className="w-4 h-4" />}
                  maxLength={10}
                  required
                />

                <Input
                  label="Login Email Address"
                  type="email"
                  placeholder="business@example.com"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  error={errors.email}
                  leftIcon={<Mail className="w-4 h-4" />}
                  required
                />

                <Input
                  label="Create Password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Minimum 8 characters"
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                  error={errors.password}
                  leftIcon={<Lock className="w-4 h-4" />}
                  rightIcon={
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-slate-400 hover:text-slate-600 focus:outline-none"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                  required
                />

                <Input
                  label="Confirm Password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Re-enter password"
                  value={formData.confirm_password}
                  onChange={e => setFormData({ ...formData, confirm_password: e.target.value })}
                  error={errors.confirm_password}
                  leftIcon={<Lock className="w-4 h-4" />}
                  required
                />
              </div>
            </div>

            <div className="pt-4">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                isLoading={isLoading}
              >
                Submit Registration & Documents for Approval
              </Button>
            </div>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 text-center text-sm text-slate-600">
            Already have a registered merchant account?{' '}
            <Link to="/login" className="font-bold text-brand-900 hover:text-brand-950 underline">
              Sign In here
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
