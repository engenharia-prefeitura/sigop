// FUNÇÃO CORRETA DE IMPORTAÇÃO XLSX
// Cole isso substituindo a função handleImportJSON no Settings.tsx

const handleImportXLSX = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoadingPessoas(true);
    try {
        console.log(`📄 Lendo arquivo XLSX: ${file.name}`);

        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        console.log(`📊 Planilha: ${sheetName}`);

        // Converter para JSON
        const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: '',
            raw: false
        });

        console.log(`📋 Total de linhas: ${jsonData.length}`);

        // Processar dados da linha 6 em diante (índice 5)
        const dataRows = jsonData.slice(5);
        console.log(`🔄 Processando ${dataRows.length} linhas...`);

        // Mapear colunas: A=0, B=1, E=4, F=5, G=6, J=9
        const pessoasData = dataRows.map((row) => {
            let codigo = String(row[0] || '').trim();
            let nome = String(row[1] || '').trim();
            let tipoPessoa = String(row[4] || '').trim();
            let cpfCnpj = String(row[5] || '').trim();
            let situacao = String(row[6] || '').trim();
            const cadastroIncompleto = String(row[9] || '').trim();

            // Normalizar tipo_pessoa
            if (tipoPessoa) {
                const n = tipoPessoa.toLowerCase();
                if (n.includes('fis') || n.includes('fí')) tipoPessoa = 'Física';
                else if (n.includes('jur') || n.includes('jú')) tipoPessoa = 'Jurídica';
                else tipoPessoa = '';
            }

            // Normalizar situacao
            situacao = situacao ? (situacao.toLowerCase().includes('ati') ? 'Ativo' : 'Inativo') : 'Ativo';

            return {
                codigo: codigo || null,
                nome: nome || null,
                tipo_pessoa: tipoPessoa || null,
                cpf_cnpj: cpfCnpj || null,
                situacao,
                cadastro_incompleto: cadastroIncompleto.toLowerCase() === 'sim'
            };
        }).filter(p => p.nome && p.nome.length > 3);

        console.log(`✅ ${pessoasData.length} registros válidos`);

        if (pessoasData.length > 0) {
            console.log(`📝 Primeiros 5:`);
            pessoasData.slice(0, 5).forEach((p, i) => {
                console.log(`   ${i + 1}. Cód: ${p.codigo || '-'} | Nome: ${p.nome} | CPF: ${p.cpf_cnpj || '-'}`);
            });
        }

        if (pessoasData.length === 0) throw new Error('Nenhum registro válido');

        // Importar em lotes
        const batchSize = 50;
        let imported = 0, errors = 0;

        setImportProgress({ current: 0, total: pessoasData.length, percent: 0 });

        for (let i = 0; i < pessoasData.length; i += batchSize) {
            const batch = pessoasData.slice(i, i + batchSize);

            try {
                const { error } = await supabase.from('pessoas').insert(batch);
                if (error) {
                    console.error('Erro:', error);
                    errors += batch.length;
                } else {
                    imported += batch.length;
                }
            } catch (e: any) {
                console.error('Erro lote:', e);
                errors += batch.length;
            }

            const current = imported + errors;
            const percent = Math.round((current / pessoasData.length) * 100);
            setImportProgress({ current, total: pessoasData.length, percent });

            if ((i / batchSize) % 20 === 0 && i > 0) {
                console.log(`   📊 Progresso: ${current}/${pessoasData.length} (${percent}%)`);
            }
        }

        setImportProgress({ current: 0, total: 0, percent: 0 });

        console.log(`\n🎉 Importação finalizada!`);
        console.log(`   ✅ ${imported} importadas`);
        if (errors > 0) console.log(`   ⚠️ ${errors} erros`);

        alert(errors > 0 ?
            `✅ ${imported} importadas\n⚠️ ${errors} erros` :
            `🎉 ${imported} importadas com sucesso!`
        );

        fetchPessoas();
        if (fileInputRef.current) fileInputRef.current.value = '';

    } catch (err: any) {
        console.error('❌ Erro:', err);
        alert(`Erro ao importar XLSX:\n\n${err.message}`);
    } finally {
        setLoadingPessoas(false);
    }
};
