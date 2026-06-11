export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">404</h1>
        <p className="text-gray-600 mb-8">Pagina nu a fost găsită</p>
        <a href="/" className="inline-block px-6 py-2 bg-green-700 text-white rounded hover:bg-green-800">
          Înapoi la acasă
        </a>
      </div>
    </div>
  );
}
