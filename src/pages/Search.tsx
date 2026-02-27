import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { User, Service } from '../types';
import { MapPin, Star, ShieldCheck } from 'lucide-react';

interface SitterWithService extends User {
  price: number;
  service_type: string;
}

export default function Search() {
  const [searchParams] = useSearchParams();
  const serviceType = searchParams.get('serviceType') || 'walking';
  const location = searchParams.get('location') || '';
  const [sitters, setSitters] = useState<SitterWithService[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSitters = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/sitters?serviceType=${serviceType}&lat=37.7749&lng=-122.4194`); // Mock lat/lng
        const data = await res.json();
        setSitters(data.sitters);
      } catch {
        // Silently handle — sitters fetch failed
      } finally {
        setLoading(false);
      }
    };

    fetchSitters();
  }, [serviceType, location]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-stone-900 mb-8">
        {serviceType === 'walking' ? 'Dog Walkers' : 
         serviceType === 'sitting' ? 'House Sitters' : 
         serviceType === 'grooming' ? 'Groomers' : 'Drop-in Visits'} 
        {' '}near {location || 'you'}
      </h1>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sitters.map((sitter) => (
            <Link key={sitter.id} to={`/sitter/${sitter.id}`} className="block group">
              <div className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden hover:shadow-md transition-all duration-300">
                <div className="flex p-6 gap-4">
                  <div className="flex-shrink-0">
                    <img 
                      src={sitter.avatar_url || `https://ui-avatars.com/api/?name=${sitter.name}`} 
                      alt={sitter.name} 
                      className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-sm"
                    />
                  </div>
                  <div className="flex-grow">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-bold text-stone-900 group-hover:text-emerald-600 transition-colors">
                          {sitter.name}
                        </h3>
                        <div className="flex items-center text-stone-500 text-sm mt-1">
                          <MapPin className="w-3 h-3 mr-1" />
                          <span>San Francisco, CA</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="block text-lg font-bold text-emerald-600">${sitter.price}</span>
                        <span className="text-xs text-stone-400">per {serviceType === 'walking' ? 'walk' : 'night'}</span>
                      </div>
                    </div>
                    
                    <p className="text-stone-600 text-sm mt-3 line-clamp-2">{sitter.bio}</p>
                    
                    <div className="mt-4 flex items-center gap-4 text-xs font-medium text-stone-500">
                      <div className="flex items-center gap-1 text-amber-500">
                        <Star className="w-3 h-3 fill-current" />
                        <span>5.0 (12)</span>
                      </div>
                      <div className="flex items-center gap-1 text-emerald-600">
                        <ShieldCheck className="w-3 h-3" />
                        <span>Verified</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
          
          {sitters.length === 0 && (
            <div className="col-span-full text-center py-12 bg-stone-50 rounded-2xl">
              <p className="text-stone-500">No sitters found matching your criteria.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
