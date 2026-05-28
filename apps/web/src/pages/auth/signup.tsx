import {useRouter} from 'next/router';
import {useEffect} from 'react';

export default function Signup() {
  const router = useRouter();

  useEffect(() => {
    void router.replace('/auth/login');
  }, [router]);

  return null;
}
