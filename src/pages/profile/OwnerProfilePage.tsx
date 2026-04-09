import { useParams } from 'react-router-dom';
import ProfileView from '../../components/profile/ProfileView';

export default function OwnerProfilePage() {
  const { slug } = useParams<{ slug: string }>();

  if (!slug) {
    return (
      <div className="max-w-[960px] mx-auto py-8 px-4 text-center text-stone-500">
        Invalid profile URL
      </div>
    );
  }

  return <ProfileView profileType="owner" slug={slug} />;
}
