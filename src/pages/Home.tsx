import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, Calendar as CalendarIcon } from 'lucide-react';

export default function Home() {
  const navigate = useNavigate();
  const [serviceType, setServiceType] = useState('walking');
  const [location, setLocation] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(`/search?serviceType=${serviceType}&location=${encodeURIComponent(location)}`);
  };

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative bg-emerald-900 text-white py-24 lg:py-32 overflow-hidden">
        <div className="absolute inset-0 z-0 opacity-20">
          <img 
            src="https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=2000&q=80" 
            alt="Dogs playing" 
            className="w-full h-full object-cover"
          />
        </div>
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            Loving pet care in your neighborhood
          </h1>
          <p className="text-xl text-emerald-100 max-w-2xl mx-auto mb-12">
            Book trusted sitters and dog walkers who'll treat your pets like family.
          </p>

          <div className="bg-white p-4 rounded-2xl shadow-xl max-w-4xl mx-auto">
            <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-stone-500 uppercase mb-1 text-left px-2">Service</label>
                <select 
                  value={serviceType}
                  onChange={(e) => setServiceType(e.target.value)}
                  className="w-full p-3 bg-stone-50 rounded-xl border-none focus:ring-2 focus:ring-emerald-500 text-stone-900 font-medium"
                >
                  <option value="walking">Dog Walking</option>
                  <option value="sitting">House Sitting</option>
                  <option value="drop-in">Drop-in Visits</option>
                  <option value="grooming">Grooming</option>
                  <option value="meet_greet">Meet & Greet</option>
                </select>
              </div>
              
              <div className="flex-[2]">
                <label className="block text-xs font-semibold text-stone-500 uppercase mb-1 text-left px-2">Location</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3.5 w-5 h-5 text-stone-400" />
                  <input 
                    type="text" 
                    placeholder="Zip code or address" 
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full p-3 pl-10 bg-stone-50 rounded-xl border-none focus:ring-2 focus:ring-emerald-500 text-stone-900 placeholder-stone-400"
                  />
                </div>
              </div>

              <div className="flex-1 flex items-end">
                <button 
                  type="submit"
                  className="w-full bg-emerald-600 text-white p-3 rounded-xl font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Search className="w-5 h-5" />
                  Search
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="py-24 bg-stone-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center mb-16 text-stone-900">Services for every pet</h2>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { title: 'Dog Walking', desc: 'Your dog gets a walk around your neighborhood.', img: 'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?auto=format&fit=crop&w=600&q=80' },
              { title: 'House Sitting', desc: 'Great for pets who are more comfortable at home.', img: 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?auto=format&fit=crop&w=600&q=80' },
              { title: 'Drop-in Visits', desc: 'Sitters stop by to feed and play with your pets.', img: 'https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=600&q=80' },
              { title: 'Grooming', desc: 'Professional grooming services at your home.', img: 'https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&w=600&q=80' },
            ].map((service) => (
              <div key={service.title} className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                <div className="h-48 overflow-hidden">
                  <img src={service.img} alt={service.title} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-bold mb-2 text-stone-900">{service.title}</h3>
                  <p className="text-stone-600">{service.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
