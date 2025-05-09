const companies = [
  {
    name: "Elevated Garage",
    slug: "elevated-garage",
    adminUrl: "/admin/elevated-garage/index.html"
  },
  {
    name: "Custom Garage Co.",
    slug: "custom-garage-co",
    adminUrl: "/admin/custom-garage-co/index.html"
  }
];

const container = document.getElementById('company-list');
companies.forEach(company => {
  const card = document.createElement('div');
  card.className = 'company-card';

  const name = document.createElement('h2');
  name.textContent = company.name;

  const link = document.createElement('a');
  link.href = company.adminUrl;
  link.textContent = "Manage";

  card.appendChild(name);
  card.appendChild(link);
  container.appendChild(card);
});