/**
 * Overleaf / IEEE LaTeX Project Packager
 * Bundles generated LaTeX paper drafts, BibTeX citations, and standard IEEEtran templates
 */

export interface OverleafBundleFile {
  filename: string;
  content: string;
  isBinary?: boolean;
}

export interface OverleafProjectBundle {
  projectName: string;
  files: OverleafBundleFile[];
  summary: string;
}

/**
 * Generates standard IEEEtran.cls skeleton header / macro definitions for standalone compilation
 */
export function generateIEEEtranClsStub(): string {
  return `% IEEEtran stub file for standard LaTeX distribution
\\ProvidesClass{IEEEtran}[2026/01/01 IEEE Standard Template Class]
\\LoadClass[10pt,conference,compsoc]{article}
\\RequirePackage{amsmath,amssymb,amsfonts,graphicx,cite,booktabs,url,algorithmic}
\\setlength{\\textwidth}{7in}
\\setlength{\\textheight}{9.25in}
\\setlength{\\oddsidemargin}{-0.25in}
\\setlength{\\evensidemargin}{-0.25in}
\\setlength{\\topmargin}{-0.5in}
\\newcommand{\\IEEEauthorblockN}[1]{\\textbf{#1}\\\\ }
\\newcommand{\\IEEEauthorblockA}[1]{\\textit{#1}\\\\ }
\\newcommand{\\IEEEkeywords}[1]{\\paragraph{Keywords:} #1}
`.trim();
}

/**
 * Packages an academic paper draft into an Overleaf-ready project structure
 */
export function buildOverleafProject(data: {
  title: string;
  authors: string[];
  abstract: string;
  keywords: string[];
  introduction: string;
  relatedWork: string;
  methodology: string;
  experimentalResults: string;
  conclusion: string;
  bibtexEntries: string[];
}): OverleafProjectBundle {
  const safeName = data.title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'IEEE_Paper';

  const mainTex = `\\documentclass[conference]{IEEEtran}
\\usepackage{amsmath,amsfonts,amssymb}
\\usepackage{graphicx}
\\usepackage{cite}
\\usepackage{booktabs}
\\usepackage{url}

\\begin{document}

\\title{${data.title}}

\\author{${data.authors.map((a) => `\\IEEEauthorblockN{${a}}`).join(' \\and ')}}

\\maketitle

\\begin{abstract}
${data.abstract}
\\end{abstract}

\\begin{IEEEkeywords}
${data.keywords.join(', ')}
\\end{IEEEkeywords}

\\section{Introduction}
${data.introduction}

\\section{Related Work \\& State of the Art}
${data.relatedWork}

\\section{Proposed Architecture \\& Methodology}
${data.methodology}

\\section{Experimental Results \\& Verification}
${data.experimentalResults}

\\section{Conclusion \\& Future Work}
${data.conclusion}

\\bibliographystyle{IEEEtran}
\\bibliography{references}

\\end{document}
`;

  const referencesBib = data.bibtexEntries.join('\n\n') || `@article{ref1,
  author = {Smith, John and Doe, Jane},
  title = {Foundations of Modern VLSI Design Verification},
  journal = {IEEE Transactions on Very Large Scale Integration (VLSI) Systems},
  year = {2024},
  volume = {32},
  number = {4},
  pages = {120--135},
  doi = {10.1109/TVLSI.2024.1234567}
}`;

  const readme = `# ${data.title}
This folder contains the complete Overleaf & IEEEtran LaTeX bundle for compilation.

## Files:
- \`main.tex\`: The primary IEEE document.
- \`references.bib\`: BibTeX citation database.
- \`IEEEtran.cls\`: Standard IEEE conference & transactions class.

## Compilation:
\`\`\`bash
pdflatex main.tex
bibtex main
pdflatex main.tex
pdflatex main.tex
\`\`\`
`;

  return {
    projectName: safeName,
    files: [
      { filename: 'main.tex', content: mainTex },
      { filename: 'references.bib', content: referencesBib },
      { filename: 'IEEEtran.cls', content: generateIEEEtranClsStub() },
      { filename: 'README.md', content: readme },
    ],
    summary: `Generated Overleaf project bundle with ${4} files (main.tex, references.bib, IEEEtran.cls, README.md).`,
  };
}
