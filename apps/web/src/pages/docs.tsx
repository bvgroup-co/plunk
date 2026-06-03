import type {GetServerSideProps} from 'next';

export default function Docs() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    notFound: true,
  };
};
