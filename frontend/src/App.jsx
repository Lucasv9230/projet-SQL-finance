import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import confetti from 'canvas-confetti';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  History,
  Layers
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('portfolio');

  const [currency, setCurrency] = useState('EUR');
  const CAD_TO_EUR_RATE = 0.68;

  const formatMoney = (amountInCad) => {
    if (amountInCad === null || amountInCad === undefined || isNaN(amountInCad)) {
      return currency === 'EUR' ? '0,00 €' : '0.00 $';
    }
    if (currency === 'EUR') {
      const eur = amountInCad * CAD_TO_EUR_RATE;
      return eur.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
    } else {
      return amountInCad.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $ CAD';
    }
  };

  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState(1);
  const [currentClient, setCurrentClient] = useState(null);
  const [compte, setCompte] = useState(null);
  const [titres, setTitres] = useState([]);
  const [positions, setPositions] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submittingOrder, setSubmittingOrder] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSector, setSelectedSector] = useState('ALL');

  const [selectedTitre, setSelectedTitre] = useState(null);
  const [orderType, setOrderType] = useState('ACHAT');
  const [orderQuantity, setOrderQuantity] = useState(10);

  const [toasts, setToasts] = useState([]);

  const addToast = (type, title, message) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  useEffect(() => {
    async function initData() {
      try {
        setLoading(true);
        const { data: clientsData, error: errClients } = await supabase
          .from('clients')
          .select('*')
          .order('client_id', { ascending: true })
          .limit(20);

        if (errClients) throw errClients;
        setClients(clientsData || []);

        if (clientsData && clientsData.length > 0) {
          setSelectedClientId(clientsData[0].client_id);
          setCurrentClient(clientsData[0]);
        }

        const { data: titresData, error: errTitres } = await supabase
          .from('titres')
          .select('*')
          .order('symbole', { ascending: true });

        if (errTitres) throw errTitres;
        setTitres(titresData || []);
        if (titresData && titresData.length > 0) {
          setSelectedTitre(titresData[0]);
        }
      } catch (err) {
        console.error('Erreur chargement Supabase:', err);
        addToast('error', 'Erreur de connexion', err.message || 'Impossible de joindre Supabase');
      } finally {
        setLoading(false);
      }
    }

    initData();
  }, []);

  const loadClientDetails = async (clientId) => {
    if (!clientId) return;
    try {
      const { data: compteData } = await supabase
        .from('comptes_especes')
        .select('*')
        .eq('client_id', clientId)
        .maybeSingle();

      setCompte(compteData || null);

      const { data: posData } = await supabase
        .from('portefeuilles_positions')
        .select(`
          position_id,
          client_id,
          titre_id,
          quantite,
          prix_moyen_achat,
          date_premier_achat,
          titres (
            symbole,
            nom,
            secteur,
            devise,
            cours_actuel
          )
        `)
        .eq('client_id', clientId);

      setPositions(posData || []);

      const { data: transData } = await supabase
        .from('transactions')
        .select(`
          transaction_id,
          client_id,
          titre_id,
          type,
          quantite,
          prix_unitaire,
          date_transaction,
          titres (
            symbole,
            nom
          )
        `)
        .eq('client_id', clientId)
        .order('date_transaction', { ascending: false })
        .limit(30);

      setTransactions(transData || []);
    } catch (err) {
      console.error('Erreur chargement client:', err);
    }
  };

  useEffect(() => {
    if (selectedClientId) {
      const client = clients.find((c) => c.client_id === Number(selectedClientId));
      setCurrentClient(client || null);
      loadClientDetails(selectedClientId);
    }
  }, [selectedClientId, clients]);

  const soldeEspecesCad = compte ? Number(compte.solde) : 0;
  
  const valeurPortefeuilleTitresCad = positions.reduce((acc, p) => {
    const cours = p.titres ? Number(p.titres.cours_actuel) : 0;
    return acc + Number(p.quantite) * cours;
  }, 0);

  const coutTotalAchatCad = positions.reduce((acc, p) => {
    return acc + Number(p.quantite) * Number(p.prix_moyen_achat);
  }, 0);

  const pnlLatenteCad = valeurPortefeuilleTitresCad - coutTotalAchatCad;
  const pnlPourcentage = coutTotalAchatCad > 0 ? (pnlLatenteCad / coutTotalAchatCad) * 100 : 0;
  const valeurTotaleCompteCad = soldeEspecesCad + valeurPortefeuilleTitresCad;

  const filteredTitres = titres.filter((t) => {
    const matchSearch =
      t.symbole.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.nom.toLowerCase().includes(searchQuery.toLowerCase());
    const matchSector = selectedSector === 'ALL' || t.secteur === selectedSector;
    return matchSearch && matchSector;
  });

  const sectorsList = ['ALL', ...new Set(titres.map((t) => t.secteur).filter(Boolean))];

  const handleExecuteTrade = async (e) => {
    if (e) e.preventDefault();
    if (!compte || !selectedTitre || orderQuantity <= 0) {
      addToast('error', 'Formulaire invalide', 'Vérifiez le titre, le compte et la quantité.');
      return;
    }

    setSubmittingOrder(true);
    try {
      const { data, error } = await supabase
        .from('transactions')
        .insert([
          {
            client_id: selectedClientId,
            compte_id: compte.compte_id,
            titre_id: selectedTitre.titre_id,
            type: orderType,
            quantite: Number(orderQuantity),
            prix_unitaire: Number(selectedTitre.cours_actuel),
            date_transaction: new Date().toISOString()
          }
        ])
        .select();

      if (error) throw error;

      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.8 }
      });

      addToast(
        'success',
        `Ordre ${orderType} Confirmé !`,
        `${orderQuantity} actions ${selectedTitre.symbole} à ${formatMoney(Number(selectedTitre.cours_actuel))} (Trigger exécuté).`
      );

      await loadClientDetails(selectedClientId);
    } catch (err) {
      console.error('Erreur transaction:', err);
      addToast(
        'error',
        'Rejet par la Base de Données',
        err.message || 'Le trigger PostgreSQL a rejeté la transaction.'
      );
    } finally {
      setSubmittingOrder(false);
    }
  };

  return (
    <div className="app-container">
      {}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === 'success' ? (
              <CheckCircle2 size={20} color="#10b981" />
            ) : (
              <AlertTriangle size={20} color="#f43f5e" />
            )}
            <div>
              <div className="toast-title">{t.title}</div>
              <div className="toast-msg">{t.message}</div>
            </div>
          </div>
        ))}
      </div>

      {}
      <header className="header">
        <div className="brand">
          <img
            src="/logo_app.jpg"
            alt="Logo Apex Finance"
            className="brand-logo-img"
          />
          <div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <h1 className="brand-title">Apex Finance</h1>
              <span className="brand-badge">
                {currency === 'EUR' ? 'Affichage en Euros (€)' : 'Affichage en Dollars ($ CAD)'}
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Plateforme de courtage connectée en direct à PostgreSQL / Supabase
            </p>
          </div>
        </div>

        <div className="header-actions">
          {}
          <div className="currency-toggle">
            <button
              type="button"
              className={`currency-btn ${currency === 'EUR' ? 'active' : ''}`}
              onClick={() => setCurrency('EUR')}
              title="Basculer l'affichage en Euros (€)"
            >
              € EUR
            </button>
            <button
              type="button"
              className={`currency-btn ${currency === 'CAD' ? 'active' : ''}`}
              onClick={() => setCurrency('CAD')}
              title="Basculer l'affichage en Dollars ($ CAD)"
            >
              $ CAD
            </button>
          </div>

          {}
          <div className="client-selector-card">
            <label>Investisseur :</label>
            <select
              className="client-select"
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(Number(e.target.value))}
            >
              {clients.map((c) => (
                <option key={c.client_id} value={c.client_id}>
                  #{c.client_id} · {c.prenom} {c.nom} ({c.email})
                </option>
              ))}
            </select>
          </div>

          <button
            className="btn-action-small"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={() => loadClientDetails(selectedClientId)}
            title="Rafraîchir les données"
          >
            <RefreshCw size={14} /> Rafraîchir
          </button>
        </div>
      </header>

      {}
      <nav className="tabs-nav">
        <button
          className={`tab-btn ${activeTab === 'portfolio' ? 'active' : ''}`}
          onClick={() => setActiveTab('portfolio')}
        >
          <Wallet size={16} /> Portefeuille & Soldes
        </button>
        <button
          className={`tab-btn ${activeTab === 'market' ? 'active' : ''}`}
          onClick={() => setActiveTab('market')}
        >
          <BarChart3 size={16} /> Marché des Titres (20 Actifs)
        </button>
        <button
          className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <History size={16} /> Historique des Ordres ({transactions.length})
        </button>
      </nav>

      {}
      <div className="stats-grid">
        {}
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Liquidités Disponibles</span>
            <div className="stat-icon">
              <Wallet size={18} />
            </div>
          </div>
          <div className="stat-value">{formatMoney(soldeEspecesCad)}</div>
          <div className="stat-subtext">
            Compte n°{compte ? compte.compte_id : '---'} · {currency === 'EUR' ? 'Taux 1 CAD = 0.68 €' : 'Devise CAD'}
          </div>
        </div>

        {}
        <div className="stat-card blue">
          <div className="stat-header">
            <span className="stat-label">Valeur Totale du Portefeuille</span>
            <div className="stat-icon">
              <Layers size={18} />
            </div>
          </div>
          <div className="stat-value">{formatMoney(valeurTotaleCompteCad)}</div>
          <div className="stat-subtext">
            Titres en portefeuille : {formatMoney(valeurPortefeuilleTitresCad)}
          </div>
        </div>

        {}
        <div className="stat-card purple">
          <div className="stat-header">
            <span className="stat-label">Plus/Moins-Value Latente</span>
            <div className="stat-icon">
              {pnlLatenteCad >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
            </div>
          </div>
          <div className="stat-value">
            <span className={pnlLatenteCad >= 0 ? 'pnl-positive' : 'pnl-negative'}>
              {pnlLatenteCad >= 0 ? '+' : ''}
              {formatMoney(pnlLatenteCad)}
            </span>
          </div>
          <div className="stat-subtext">
            Performance latente :{' '}
            <span className={pnlLatenteCad >= 0 ? 'pnl-positive' : 'pnl-negative'}>
              {pnlPourcentage.toFixed(2)} %
            </span>
          </div>
        </div>

        {}
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Lignes Détenues</span>
            <div className="stat-icon">
              <BarChart3 size={18} />
            </div>
          </div>
          <div className="stat-value">{positions.length}</div>
          <div className="stat-subtext">Titres différents en portefeuille</div>
        </div>
      </div>

      {
}
      {activeTab === 'portfolio' && (
        <div className="card-panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">
                <Wallet size={20} color="#10b981" /> Positions Actives en Portefeuille
              </h2>
              <p style={{ color: '#64748b', fontSize: '0.85rem' }}>
                Actions détenues pour {currentClient?.prenom} {currentClient?.nom} calculées d'après les transactions.
              </p>
            </div>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Titre & Symbole</th>
                  <th>Secteur</th>
                  <th>Quantité</th>
                  <th>Prix Moyen d'Achat (PMP)</th>
                  <th>Cours Actuel</th>
                  <th>Valeur Marché</th>
                  <th>P&L Latente</th>
                  <th>Actions Rapides</th>
                </tr>
              </thead>
              <tbody>
                {positions.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', color: '#64748b', padding: '32px' }}>
                      Aucune position active pour ce client. Utilisez l'onglet Marché pour passer des ordres.
                    </td>
                  </tr>
                ) : (
                  positions.map((p) => {
                    const titre = p.titres || {};
                    const coursCad = Number(titre.cours_actuel || 0);
                    const qte = Number(p.quantite);
                    const pmpCad = Number(p.prix_moyen_achat);
                    const valeurCad = qte * coursCad;
                    const pnlCad = valeurCad - qte * pmpCad;
                    const pnlPct = pmpCad > 0 ? ((coursCad - pmpCad) / pmpCad) * 100 : 0;

                    return (
                      <tr key={p.position_id}>
                        <td>
                          <div className="ticker-cell">
                            <span className="ticker-badge">{titre.symbole}</span>
                            <div>
                              <div style={{ fontWeight: 600 }}>{titre.nom}</div>
                              <span className="ticker-name">{titre.devise}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="badge badge-blue">{titre.secteur || 'Général'}</span>
                        </td>
                        <td className="mono-num">{qte.toLocaleString()}</td>
                        <td className="mono-num">{formatMoney(pmpCad)}</td>
                        <td className="mono-num" style={{ fontWeight: 700 }}>
                          {formatMoney(coursCad)}
                        </td>
                        <td className="mono-num" style={{ fontWeight: 700 }}>
                          {formatMoney(valeurCad)}
                        </td>
                        <td className="mono-num">
                          <span className={pnlCad >= 0 ? 'pnl-positive' : 'pnl-negative'}>
                            {pnlCad >= 0 ? '+' : ''}
                            {formatMoney(pnlCad)} ({pnlPct.toFixed(1)}%)
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              className="btn-action-small"
                              style={{ color: '#10b981' }}
                              onClick={() => {
                                const found = titres.find((t) => t.titre_id === p.titre_id);
                                if (found) setSelectedTitre(found);
                                setOrderType('ACHAT');
                                setActiveTab('market');
                              }}
                            >
                              + Acheter
                            </button>
                            <button
                              className="btn-action-small"
                              style={{ color: '#f43f5e' }}
                              onClick={() => {
                                const found = titres.find((t) => t.titre_id === p.titre_id);
                                if (found) setSelectedTitre(found);
                                setOrderType('VENTE');
                                setActiveTab('market');
                              }}
                            >
                              - Vendre
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {
}
      {activeTab === 'market' && (
        <div className="trading-layout">
          {}
          <div className="card-panel" style={{ margin: 0 }}>
            <div className="panel-header">
              <div>
                <h2 className="panel-title">
                  <BarChart3 size={20} color="#38bdf8" /> Cotations du Marché
                </h2>
                <p style={{ color: '#64748b', fontSize: '0.85rem' }}>
                  20 actions cotées (Banques, Énergie, Shopify, etc.) converties en {currency === 'EUR' ? 'Euros (€)' : 'Dollars ($ CAD)'}.
                </p>
              </div>
            </div>

            {}
            <div className="market-search-bar">
              <div style={{ position: 'relative', flex: 1 }}>
                <Search
                  size={16}
                  style={{ position: 'absolute', left: '12px', top: '13px', color: '#64748b' }}
                />
                <input
                  type="text"
                  className="search-input"
                  style={{ paddingLeft: '38px' }}
                  placeholder="Rechercher par symbole (ex: SHOP.TO, RY.TO) ou nom..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <select
                className="sector-filter"
                value={selectedSector}
                onChange={(e) => setSelectedSector(e.target.value)}
              >
                {sectorsList.map((s) => (
                  <option key={s} value={s}>
                    {s === 'ALL' ? 'Tous les secteurs' : s}
                  </option>
                ))}
              </select>
            </div>

            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Symbole</th>
                    <th>Nom Entreprise</th>
                    <th>Secteur</th>
                    <th>Cours Actuel</th>
                    <th>Sélectionner</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTitres.map((t) => {
                    const isSelected = selectedTitre && selectedTitre.titre_id === t.titre_id;
                    return (
                      <tr
                        key={t.titre_id}
                        style={{
                          backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.08)' : 'transparent',
                          cursor: 'pointer'
                        }}
                        onClick={() => setSelectedTitre(t)}
                      >
                        <td>
                          <span className="ticker-badge" style={{ color: isSelected ? '#38bdf8' : 'white' }}>
                            {t.symbole}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{t.nom}</td>
                        <td>
                          <span className="badge badge-blue">{t.secteur}</span>
                        </td>
                        <td className="mono-num" style={{ fontSize: '1rem', fontWeight: 700 }}>
                          {formatMoney(Number(t.cours_actuel))}
                        </td>
                        <td>
                          <button
                            className="btn-action-small"
                            style={{
                              backgroundColor: isSelected ? '#38bdf8' : 'rgba(255,255,255,0.05)',
                              color: isSelected ? '#000' : 'white',
                              fontWeight: 700
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTitre(t);
                            }}
                          >
                            {isSelected ? 'Sélectionné' : 'Choisir'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {}
          <div className="order-box">
            <h3 className="order-box-title">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ArrowUpRight size={18} color="#10b981" /> Passer un Ordre
              </div>
              <span className="badge badge-green">En Direct</span>
            </h3>

            {}
            <div className="order-type-toggle">
              <button
                type="button"
                className={`toggle-btn buy ${orderType === 'ACHAT' ? 'active' : ''}`}
                onClick={() => setOrderType('ACHAT')}
              >
                ACHAT
              </button>
              <button
                type="button"
                className={`toggle-btn sell ${orderType === 'VENTE' ? 'active' : ''}`}
                onClick={() => setOrderType('VENTE')}
              >
                VENTE
              </button>
            </div>

            {selectedTitre ? (
              <form onSubmit={handleExecuteTrade}>
                <div className="form-group">
                  <label>Titre Sélectionné</label>
                  <div
                    style={{
                      padding: '12px 16px',
                      background: 'rgba(15, 23, 42, 0.8)',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                        {selectedTitre.symbole}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{selectedTitre.nom}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, color: '#10b981', fontFamily: 'var(--font-mono)' }}>
                        {formatMoney(Number(selectedTitre.cours_actuel))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label>Quantité d'actions</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className="form-input"
                    value={orderQuantity}
                    onChange={(e) => setOrderQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    required
                  />
                </div>

                {}
                <div className="order-summary">
                  <div className="summary-row">
                    <span>Prix unitaire officiel :</span>
                    <span className="mono-num">{formatMoney(Number(selectedTitre.cours_actuel))}</span>
                  </div>
                  <div className="summary-row">
                    <span>Quantité demandée :</span>
                    <span className="mono-num">{orderQuantity}</span>
                  </div>
                  <div className="summary-row">
                    <span>Solde disponible :</span>
                    <span className="mono-num">{formatMoney(soldeEspecesCad)}</span>
                  </div>
                  <div className="summary-row total">
                    <span>Montant estimé :</span>
                    <span className="mono-num" style={{ color: orderType === 'ACHAT' ? '#10b981' : '#f43f5e' }}>
                      {formatMoney(orderQuantity * Number(selectedTitre.cours_actuel))}
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submittingOrder}
                  className={`btn-submit-order ${orderType === 'ACHAT' ? 'buy' : 'sell'}`}
                >
                  {submittingOrder ? (
                    'Exécution par PostgreSQL...'
                  ) : (
                    <>
                      {orderType === 'ACHAT' ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                      Confirmer l'Ordre d'{orderType} ({selectedTitre.symbole})
                    </>
                  )}
                </button>
              </form>
            ) : (
              <p style={{ color: '#64748b', textAlign: 'center', padding: '24px' }}>
                Sélectionnez un titre dans le tableau de gauche pour émettre un ordre.
              </p>
            )}
          </div>
        </div>
      )}

      {
}
      {activeTab === 'history' && (
        <div className="card-panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">
                <History size={20} color="#a855f7" /> Journal des Transactions
              </h2>
              <p style={{ color: '#64748b', fontSize: '0.85rem' }}>
                Historique des ordres passés pour {currentClient?.prenom} {currentClient?.nom} (Table transactions).
              </p>
            </div>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID Transaction</th>
                  <th>Date & Heure</th>
                  <th>Titre</th>
                  <th>Type d'Ordre</th>
                  <th>Quantité</th>
                  <th>Prix Unitaire</th>
                  <th>Montant Total</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', color: '#64748b', padding: '32px' }}>
                      Aucune transaction récente enregistrée pour ce compte.
                    </td>
                  </tr>
                ) : (
                  transactions.map((t) => {
                    const totalCad = Number(t.quantite) * Number(t.prix_unitaire);
                    return (
                      <tr key={t.transaction_id}>
                        <td className="mono-num" style={{ color: '#64748b' }}>
                          #{t.transaction_id}
                        </td>
                        <td>{new Date(t.date_transaction).toLocaleString('fr-FR')}</td>
                        <td>
                          <span className="ticker-badge">{t.titres?.symbole || `Titre #${t.titre_id}`}</span>
                        </td>
                        <td>
                          <span className={`badge ${t.type === 'ACHAT' ? 'badge-green' : 'badge-red'}`}>
                            {t.type}
                          </span>
                        </td>
                        <td className="mono-num">{Number(t.quantite).toLocaleString()}</td>
                        <td className="mono-num">{formatMoney(Number(t.prix_unitaire))}</td>
                        <td
                          className="mono-num"
                          style={{
                            fontWeight: 700,
                            color: t.type === 'ACHAT' ? '#f8fafc' : '#10b981'
                          }}
                        >
                          {formatMoney(totalCad)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
