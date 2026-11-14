export type Template = {
  id: string;
  name: string;
  blurb: string;
  files: { path: string; content: string }[];
};

const paper = String.raw`\documentclass[11pt]{article}

\usepackage[margin=1in]{geometry}
\usepackage{amsmath,amssymb,amsthm}
\usepackage{graphicx}
\usepackage[hidelinks]{hyperref}
\usepackage{booktabs}
\usepackage[numbers]{natbib}

\newtheorem{theorem}{Theorem}
\newtheorem{lemma}[theorem]{Lemma}

\title{A Short Note on Sparse Attention}
\author{Your Name \\ \small Your Lab}
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
We study the cost of attention when only a few keys matter. We show that a
simple top-$k$ rule keeps most of the signal while cutting the work from
$O(n^2)$ to $O(nk)$. Experiments on long-document tasks back this up.
\end{abstract}

\section{Introduction}
\label{sec:intro}
Transformers \citep{vaswani2017attention} compute attention over every pair of
tokens. For a sequence of length $n$ this costs $O(n^2)$ time and memory.

\section{Method}
\label{sec:method}
Given queries $Q$, keys $K$ and values $V$, standard attention is
\begin{equation}
  \operatorname{Attn}(Q,K,V) = \operatorname{softmax}\!\left(\frac{QK^\top}{\sqrt{d}}\right)V .
  \label{eq:attn}
\end{equation}
We keep only the $k$ largest scores in each row of Eq.~\eqref{eq:attn}.

\begin{theorem}
If the scores in each row are sorted and $k \ge \log n$, the top-$k$ rule keeps
at least a $1-\epsilon$ share of the softmax mass for well-separated rows.
\end{theorem}

\section{Results}
\label{sec:results}
\begin{table}[h]
  \centering
  \begin{tabular}{lcc}
    \toprule
    Method & Accuracy & Speed-up \\
    \midrule
    Full attention & 81.2 & 1.0$\times$ \\
    Top-$k$ ($k=64$) & 80.7 & 5.8$\times$ \\
    \bottomrule
  \end{tabular}
  \caption{Long-document classification.}
\end{table}

\section{Conclusion}
Top-$k$ attention is a cheap, strong baseline.

\bibliographystyle{plainnat}
\bibliography{refs}

\end{document}
`;

const refs = String.raw`@article{vaswani2017attention,
  title   = {Attention Is All You Need},
  author  = {Vaswani, Ashish and Shazeer, Noam and Parmar, Niki and Uszkoreit, Jakob and Jones, Llion and Gomez, Aidan N. and Kaiser, Lukasz and Polosukhin, Illia},
  journal = {Advances in Neural Information Processing Systems},
  volume  = {30},
  year    = {2017}
}
`;

const blank = String.raw`\documentclass[11pt]{article}

\usepackage[margin=1in]{geometry}
\usepackage{amsmath,amssymb}
\usepackage[hidelinks]{hyperref}

\title{Untitled}
\author{}
\date{\today}

\begin{document}
\maketitle

\section{Introduction}
Start writing here. Press \texttt{Cmd+K} on a selection to ask AI to edit it.

\end{document}
`;

const notes = String.raw`\documentclass[11pt]{article}

\usepackage[margin=0.9in]{geometry}
\usepackage{amsmath,amssymb,amsthm}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}

\theoremstyle{definition}
\newtheorem{definition}{Definition}
\newtheorem{example}{Example}
\theoremstyle{plain}
\newtheorem{proposition}{Proposition}

\title{Lecture Notes: Linear Algebra Refresher}
\author{}
\date{}

\begin{document}
\maketitle

\section{Vector spaces}
\begin{definition}
A \emph{vector space} over a field $\mathbb{F}$ is a set $V$ with addition and
scalar multiplication satisfying the usual axioms.
\end{definition}

\begin{example}
$\mathbb{R}^n$ with component-wise operations.
\end{example}

\section{Eigenvalues}
For a square matrix $A$, a scalar $\lambda$ is an eigenvalue if
$\det(A - \lambda I) = 0$.

\begin{proposition}
A real symmetric matrix has real eigenvalues and an orthonormal eigenbasis.
\end{proposition}
\begin{proof}
Left as an exercise.
\end{proof}

\end{document}
`;

const beamer = String.raw`\documentclass{beamer}
\usetheme{default}
\usecolortheme{dove}
\setbeamertemplate{navigation symbols}{}

\title{Talk Title}
\author{Your Name}
\date{\today}

\begin{document}

\begin{frame}
  \titlepage
\end{frame}

\begin{frame}{Motivation}
  \begin{itemize}
    \item Problem we care about
    \item Why existing methods fall short
    \item What we do instead
  \end{itemize}
\end{frame}

\begin{frame}{Key idea}
  \[
    \mathcal{L}(\theta) = \mathbb{E}_{x \sim p}\big[\ell(f_\theta(x))\big]
  \]
\end{frame}

\begin{frame}{Takeaways}
  Thanks!
\end{frame}

\end{document}
`;

export const TEMPLATES: Template[] = [
  {
    id: "paper",
    name: "Research paper",
    blurb: "Article with abstract, theorem, table and BibTeX references.",
    files: [
      { path: "main.tex", content: paper },
      { path: "refs.bib", content: refs },
    ],
  },
  {
    id: "blank",
    name: "Blank document",
    blurb: "A clean article to start from scratch.",
    files: [{ path: "main.tex", content: blank }],
  },
  {
    id: "notes",
    name: "Lecture notes",
    blurb: "Definitions, examples and proofs, ready to fill in.",
    files: [{ path: "main.tex", content: notes }],
  },
  {
    id: "beamer",
    name: "Slides (Beamer)",
    blurb: "A minimal talk deck.",
    files: [{ path: "main.tex", content: beamer }],
  },
];
